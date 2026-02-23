import { Connection, PublicKey, ParsedTransactionWithMeta, ParsedAccountData } from "@solana/web3.js";
import { logger } from "../middleware/logger";

const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const TOKEN_2022_PROGRAM_ID = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");

const DEBUG_DEPOSIT = process.env.DEBUG_DEPOSIT_VERIFY === "1" || process.env.NODE_ENV !== "production";

interface VerificationResult {
  valid: boolean;
  error?: string;
  reason?: string;
  verifiedAmount?: number;
  sender?: string;
  senderOwner?: string;
  receiver?: string;
  mint?: string;
  /** Diagnostic data for 400 responses when verification fails */
  diagnostic?: {
    expected: { vault: string; mint: string; tokenProgram: string; decimals?: number };
    foundTransfers: Array<{
      destination: string;
      mint: string;
      amountUi: number;
      tokenProgram: string;
      source?: string;
    }>;
  };
}

interface TokenAccountInfo {
  mint: string;
  owner: string;
  decimals: number;
}

/** Derive vault ATA from owner + mint for a given token program */
function deriveVaultATA(
  vaultOwner: string,
  mint: string,
  tokenProgramPubkey: PublicKey
): string {
  const [ata] = PublicKey.findProgramAddressSync(
    [
      new PublicKey(vaultOwner).toBuffer(),
      tokenProgramPubkey.toBuffer(),
      new PublicKey(mint).toBuffer(),
    ],
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  return ata.toBase58();
}

async function getTokenAccountInfo(
  connection: Connection,
  tokenAccountAddress: string
): Promise<TokenAccountInfo | null> {
  try {
    const pubkey = new PublicKey(tokenAccountAddress);
    const accountInfo = await connection.getParsedAccountInfo(pubkey);
    
    if (!accountInfo.value || !("parsed" in (accountInfo.value.data as any))) {
      return null;
    }
    
    const parsedData = (accountInfo.value.data as ParsedAccountData).parsed;
    if (parsedData.type !== "account") {
      return null;
    }
    
    return {
      mint: parsedData.info.mint,
      owner: parsedData.info.owner,
      decimals: parsedData.info.tokenAmount?.decimals || 8,
    };
  } catch (error) {
    logger.error({ error: "Failed to fetch token account info", details: error });
    return null;
  }
}

interface ParsedTransfer {
  destination: string;
  source: string;
  authority: string;
  mint: string;
  amountUi: number;
  amountRaw: number;
  decimals: number;
  tokenProgram: string;
}

function collectTransfers(tx: ParsedTransactionWithMeta): ParsedTransfer[] {
  const transfers: ParsedTransfer[] = [];
  const programs = ["spl-token", "spl-token-2022"];

  function processInstruction(ix: any): void {
    if (!("parsed" in ix) || !programs.includes(ix.program ?? "")) return;
    const parsed = ix.parsed;
    if (parsed.type !== "transfer" && parsed.type !== "transferChecked") return;

    const dest = parsed.info.destination ?? parsed.info.account;
    const destStr = typeof dest === "string" ? dest : dest?.toString?.();
    const sourceStr = typeof parsed.info.source === "string"
      ? parsed.info.source
      : parsed.info.source?.toString?.() ?? "";
    const authorityStr = typeof parsed.info.authority === "string"
      ? parsed.info.authority
      : parsed.info.authority?.toString?.() ?? "";

    let amountUi = 0;
    let amountRaw = 0;
    let decimals = 8;
    let mint = parsed.info.mint ?? "";

    if (parsed.type === "transferChecked" && parsed.info.tokenAmount) {
      amountUi = Number(parsed.info.tokenAmount.uiAmount ?? 0);
      amountRaw = Number(parsed.info.tokenAmount.amount ?? 0);
      decimals = parsed.info.tokenAmount.decimals ?? 8;
    } else if (parsed.type === "transfer") {
      amountRaw = Number(parsed.info.amount ?? 0);
    }

    const tokenProgram = ix.program === "spl-token-2022"
      ? TOKEN_2022_PROGRAM_ID.toBase58()
      : TOKEN_PROGRAM_ID.toBase58();

    transfers.push({
      destination: destStr ?? "",
      source: sourceStr,
      authority: authorityStr,
      mint,
      amountUi: amountUi || (amountRaw > 0 ? amountRaw / Math.pow(10, decimals) : 0),
      amountRaw,
      decimals,
      tokenProgram,
    });
  }

  for (const ix of tx.transaction.message.instructions) {
    processInstruction(ix);
  }
  for (const inner of tx.meta?.innerInstructions ?? []) {
    for (const ix of inner.instructions) {
      processInstruction(ix);
    }
  }
  return transfers;
}

/** Build set of acceptable destination addresses (vault owner + vault ATA for both token programs) */
function getExpectedDestinations(vaultOwner: string, mint: string): Set<string> {
  const set = new Set<string>();
  const v = vaultOwner.toLowerCase();
  set.add(v);
  set.add(deriveVaultATA(vaultOwner, mint, TOKEN_2022_PROGRAM_ID).toLowerCase());
  set.add(deriveVaultATA(vaultOwner, mint, TOKEN_PROGRAM_ID).toLowerCase());
  return set;
}

export async function verifyDeposit(
  txSignature: string,
  expectedRecipient: string,
  expectedMint: string,
  claimedAmount: number,
  expectedSenderWallet: string
): Promise<VerificationResult> {
  const diagnosticPayload = {
    expected: {
      vault: expectedRecipient,
      vaultAtaToken2022: deriveVaultATA(expectedRecipient, expectedMint, TOKEN_2022_PROGRAM_ID),
      vaultAtaLegacy: deriveVaultATA(expectedRecipient, expectedMint, TOKEN_PROGRAM_ID),
      mint: expectedMint,
      tokenProgram: "Token-2022 or Tokenkeg (SPL)",
    },
    foundTransfers: [] as Array<{
      destination: string;
      mint: string;
      amountUi: number;
      tokenProgram: string;
      source?: string;
    }>,
  };

  try {
    const connection = new Connection(SOLANA_RPC_URL, "confirmed");
    let tx = await connection.getParsedTransaction(txSignature, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });

    if (!tx) {
      tx = await connection.getParsedTransaction(txSignature, {
        commitment: "finalized",
        maxSupportedTransactionVersion: 0,
      });
    }

    if (!tx) {
      return {
        valid: false,
        error: "Transaction not found on chain",
        reason: "Transaction may not be confirmed yet. Try again in a few seconds.",
      };
    }

    if (tx.meta?.err) {
      return {
        valid: false,
        error: "Transaction failed on chain",
        reason: String(tx.meta.err),
      };
    }

    const expectedDests = getExpectedDestinations(expectedRecipient, expectedMint);
    const allTransfers = collectTransfers(tx);

    if (DEBUG_DEPOSIT) {
      logger.info({
        txSignature,
        expectedVault: expectedRecipient,
        expectedVaultAta2022: deriveVaultATA(expectedRecipient, expectedMint, TOKEN_2022_PROGRAM_ID),
        expectedVaultAtaLegacy: deriveVaultATA(expectedRecipient, expectedMint, TOKEN_PROGRAM_ID),
        expectedMint,
        foundTransfers: allTransfers.map((t) => ({
          destination: t.destination,
          mint: t.mint,
          amountUi: t.amountUi,
          tokenProgram: t.tokenProgram,
        })),
      });
    }

    for (const t of allTransfers) {
      diagnosticPayload.foundTransfers.push({
        destination: t.destination,
        mint: t.mint,
        amountUi: t.amountUi,
        tokenProgram: t.tokenProgram,
        source: t.source ? `${t.source.slice(0, 6)}...${t.source.slice(-4)}` : undefined,
      });
    }
    if (diagnosticPayload.foundTransfers.length > 10) {
      diagnosticPayload.foundTransfers = diagnosticPayload.foundTransfers.slice(0, 10);
    }

    let match: ParsedTransfer | null = null;
    for (const t of allTransfers) {
      if (expectedDests.has(t.destination.toLowerCase())) {
        match = t;
        break;
      }
    }

    if (!match) {
      return {
        valid: false,
        error: "Deposit verification failed",
        reason: "No transfer to vault address found in transaction",
        diagnostic: {
          expected: {
            vault: expectedRecipient,
            mint: expectedMint,
            tokenProgram: "Token-2022 or Tokenkeg (SPL)",
          },
          foundTransfers: diagnosticPayload.foundTransfers,
        },
      };
    }

    let mint = match.mint;
    let decimals = match.decimals;
    let verifiedAmount = match.amountUi;

    if (!mint && match.source) {
      const sourceInfo = await getTokenAccountInfo(connection, match.source);
      if (!sourceInfo) {
        return {
          valid: false,
          error: "Could not verify source token account",
          diagnostic: {
            expected: { vault: expectedRecipient, mint: expectedMint, tokenProgram: "Token-2022 or Tokenkeg" },
            foundTransfers: diagnosticPayload.foundTransfers,
          },
        };
      }
      mint = sourceInfo.mint;
      decimals = sourceInfo.decimals;
      if (match.amountRaw > 0 && verifiedAmount === 0) {
        verifiedAmount = match.amountRaw / Math.pow(10, decimals);
      }
    }

    if (match.authority.toLowerCase() !== expectedSenderWallet.toLowerCase()) {
      return {
        valid: false,
        error: "Transfer was not initiated by your wallet",
        reason: `Authority ${match.authority} does not match ${expectedSenderWallet}`,
        diagnostic: {
          expected: { vault: expectedRecipient, mint: expectedMint, tokenProgram: match.tokenProgram },
          foundTransfers: diagnosticPayload.foundTransfers,
        },
      };
    }

    if (expectedMint && mint.toLowerCase() !== expectedMint.toLowerCase()) {
      return {
        valid: false,
        error: "Token mint does not match HIVE token",
        reason: `Expected mint ${expectedMint}, found ${mint}`,
        diagnostic: {
          expected: { vault: expectedRecipient, mint: expectedMint, tokenProgram: match.tokenProgram },
          foundTransfers: diagnosticPayload.foundTransfers,
        },
      };
    }

    const tolerance = 0.00000001;
    if (Math.abs(verifiedAmount - claimedAmount) > tolerance) {
      return {
        valid: false,
        error: `Amount mismatch: claimed ${claimedAmount}, found ${verifiedAmount}`,
        reason: `Verify the deposit amount matches what you sent.`,
        diagnostic: {
          expected: { vault: expectedRecipient, mint: expectedMint, tokenProgram: match.tokenProgram, decimals },
          foundTransfers: diagnosticPayload.foundTransfers,
        },
      };
    }

    return {
      valid: true,
      verifiedAmount,
      sender: match.source,
      senderOwner: match.authority,
      receiver: match.destination,
      mint,
    };
  } catch (error) {
    logger.error({ error: "Solana verification failed", details: error });
    return {
      valid: false,
      error: "Failed to verify transaction on chain",
      reason: error instanceof Error ? error.message : String(error),
      diagnostic: {
        expected: {
          vault: expectedRecipient,
          mint: expectedMint,
          tokenProgram: "Token-2022 or Tokenkeg (SPL)",
        },
        foundTransfers: diagnosticPayload.foundTransfers,
      },
    };
  }
}

export async function getConnection(): Promise<Connection> {
  return new Connection(SOLANA_RPC_URL, "confirmed");
}

/** Resolve token program (Token-2022 or legacy) by querying mint account owner */
async function getMintTokenProgram(mintAddress: string): Promise<PublicKey> {
  const connection = new Connection(SOLANA_RPC_URL, "confirmed");
  const mintPk = new PublicKey(mintAddress);
  const info = await connection.getAccountInfo(mintPk);
  if (!info) {
    throw new Error(`Mint account ${mintAddress} not found`);
  }
  const owner = info.owner.toBase58();
  if (owner === TOKEN_2022_PROGRAM_ID.toBase58()) {
    return TOKEN_2022_PROGRAM_ID;
  }
  if (owner === TOKEN_PROGRAM_ID.toBase58()) {
    return TOKEN_PROGRAM_ID;
  }
  throw new Error(`Unknown token program for mint: owner=${owner}`);
}

export interface DepositInfo {
  vaultOwner: string;
  vaultTokenAccount: string;
  mintAddress: string;
  tokenProgram: string;
  instructions: string;
}

/** Get deposit info with vault ATA derived from mint's token program */
export async function getDepositInfo(
  vaultOwner: string,
  mintAddress: string
): Promise<DepositInfo> {
  if (!vaultOwner || !mintAddress) {
    throw new Error("HIVE_VAULT_ADDRESS and HIVE_MINT must be set");
  }
  const tokenProgram = await getMintTokenProgram(mintAddress);
  const vaultTokenAccount = deriveVaultATA(vaultOwner, mintAddress, tokenProgram);
  const tokenProgramId = tokenProgram.toBase58();
  return {
    vaultOwner,
    vaultTokenAccount,
    mintAddress,
    tokenProgram: tokenProgramId,
    instructions:
      "Send HIVE tokens to vaultTokenAccount (ATA), then call POST /api/stake/confirm with the transaction signature",
  };
}
