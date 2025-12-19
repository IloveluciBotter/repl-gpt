import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";
import { PublicKey } from "@solana/web3.js";
import nacl from "tweetnacl";
import { getHiveBalance } from "./solana";
import { getHivePrice } from "./jupiter";

const JWT_SECRET = process.env.JWT_SECRET || "change-me-in-production";

// Creator public key for admin-only access
const CREATOR_PUBLIC_KEY = process.env.CREATOR_PUBLIC_KEY || "";

// Token-amount based gating (primary - used for access decision)
const MIN_HIVE_ACCESS = parseFloat(process.env.MIN_HIVE_ACCESS || "50");

// USD-based threshold (kept for informational display only, NOT used for gating)
const MIN_USD_ACCESS = parseFloat(process.env.MIN_USD_ACCESS || "1");

// Store nonces temporarily (in production, use Redis or similar)
const nonceStore = new Map<string, { nonce: string; expiresAt: number }>();
const NONCE_TTL = 5 * 60 * 1000; // 5 minutes

// Cache for balance + price checks (60 seconds)
interface AccessCache {
  hasAccess: boolean;
  hiveAmount: number;
  requiredHiveAmount: number;
  hiveUsd: number | null;
  priceUsd: number | null;
  priceMissing: boolean;
  timestamp: number;
}

const accessCache = new Map<string, AccessCache>();
const ACCESS_CACHE_TTL = 60 * 1000; // 60 seconds

/**
 * Generate a random nonce for wallet challenge
 */
export function generateNonce(): string {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

/**
 * Store nonce for a public key
 */
export function storeNonce(publicKey: string, nonce: string): void {
  nonceStore.set(publicKey, {
    nonce,
    expiresAt: Date.now() + NONCE_TTL,
  });
}

/**
 * Get and verify nonce for a public key
 */
export function verifyNonce(publicKey: string, nonce: string): boolean {
  const stored = nonceStore.get(publicKey);
  if (!stored) return false;
  if (Date.now() > stored.expiresAt) {
    nonceStore.delete(publicKey);
    return false;
  }
  if (stored.nonce !== nonce) return false;
  nonceStore.delete(publicKey);
  return true;
}

/**
 * Verify Solana signature
 */
export async function verifySignature(
  publicKey: string,
  signature: string,
  message: string
): Promise<boolean> {
  try {
    const pubKey = new PublicKey(publicKey);
    const sigBytes = Uint8Array.from(Buffer.from(signature, "base64"));
    const msgBytes = new TextEncoder().encode(message);

    // Verify signature using nacl (ed25519)
    return nacl.sign.detached.verify(msgBytes, sigBytes, pubKey.toBytes());
  } catch (error) {
    console.error("Signature verification error:", error);
    return false;
  }
}

/**
 * Issue JWT token for authenticated user
 */
export function issueToken(publicKey: string): string {
  return jwt.sign({ publicKey }, JWT_SECRET, { expiresIn: "7d" });
}

/**
 * Verify JWT token and extract public key
 */
export function verifyToken(token: string): string | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { publicKey: string };
    return decoded.publicKey;
  } catch (error) {
    return null;
  }
}

/**
 * Middleware to require authentication
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = req.cookies?.authToken || req.headers.authorization?.replace("Bearer ", "");

  if (!token) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const publicKey = verifyToken(token);
  if (!publicKey) {
    res.status(401).json({ error: "Invalid token" });
    return;
  }

  // Attach public key to request
  (req as any).publicKey = publicKey;
  next();
}

/**
 * Check if user has access (≥MIN_HIVE_ACCESS tokens)
 * Gating is based on TOKEN AMOUNT only, not USD value.
 * Price info is fetched for display purposes only.
 * Uses caching to avoid excessive RPC calls.
 */
export async function checkHiveAccess(publicKey: string): Promise<{
  hasAccess: boolean;
  hiveAmount: number;
  requiredHiveAmount: number;
  hiveUsd: number | null;
  priceUsd: number | null;
  priceMissing: boolean;
}> {
  // Check cache first
  const cached = accessCache.get(publicKey);
  if (cached && Date.now() - cached.timestamp < ACCESS_CACHE_TTL) {
    return {
      hasAccess: cached.hasAccess,
      hiveAmount: cached.hiveAmount,
      requiredHiveAmount: cached.requiredHiveAmount,
      hiveUsd: cached.hiveUsd,
      priceUsd: cached.priceUsd,
      priceMissing: cached.priceMissing,
    };
  }

  // Fetch balance and price (price is for display only)
  const [hiveAmount, priceUsd] = await Promise.all([
    getHiveBalance(publicKey),
    getHivePrice(),
  ]);

  const priceMissing = priceUsd === null;
  const hiveUsd = priceUsd !== null ? hiveAmount * priceUsd : null;

  // Gating based on TOKEN AMOUNT only - no dependency on price
  const hasAccess = hiveAmount >= MIN_HIVE_ACCESS;

  const result = {
    hasAccess,
    hiveAmount,
    requiredHiveAmount: MIN_HIVE_ACCESS,
    hiveUsd,
    priceUsd,
    priceMissing,
  };

  // Update cache
  accessCache.set(publicKey, {
    ...result,
    timestamp: Date.now(),
  });

  return result;
}

/**
 * Middleware to require HIVE access
 */
export async function requireHiveAccess(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const publicKey = (req as any).publicKey;
  if (!publicKey) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const access = await checkHiveAccess(publicKey);
  if (!access.hasAccess) {
    res.status(403).json({ error: "HIVE_REQUIRED" });
    return;
  }

  // Attach access info to request
  (req as any).hiveAccess = access;
  next();
}

/**
 * Check if a public key is the creator
 */
export function isCreator(publicKey: string): boolean {
  if (!CREATOR_PUBLIC_KEY) {
    console.warn("CREATOR_PUBLIC_KEY not set - creator access disabled");
    return false;
  }
  return publicKey === CREATOR_PUBLIC_KEY;
}

/**
 * Middleware to require creator access
 * Only the wallet matching CREATOR_PUBLIC_KEY can access protected routes
 */
export function requireCreator(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const publicKey = (req as any).publicKey;
  
  if (!publicKey) {
    res.status(401).json({ error: "Unauthorized - wallet authentication required" });
    return;
  }

  if (!isCreator(publicKey)) {
    res.status(403).json({ 
      error: "CREATOR_ONLY",
      message: "This action is restricted to the HiveMind creator only"
    });
    return;
  }

  next();
}

