# HiveMind Deployment Readiness Report

**Generated:** February 23, 2025  
**Scope:** Full code-based audit of production readiness

---

## A) Executive Summary

**Ready to deploy: NO**

### Top 5 risks that could break production

1. **CRITICAL – Trust boundary violation in training submit**  
   Score is computed from client-provided `answers` and `correctAnswers`. A malicious user can forge perfect scores, pass the fee threshold, and get full refunds. File: `server/routes.ts` lines 1213–1218.

2. **CRITICAL – Deposit race condition (double credit)**  
   Concurrent `/api/stake/confirm` requests can both pass the `getStakeLedgerByTxSignature` check before either inserts. Both update balance → double credit. File: `server/routes.ts` lines 1050–1106.

3. **HIGH – Missing environment variables in production**  
   `HIVE_VAULT_ADDRESS`, `HIVE_MINT` empty → deposit flow fails. `PUBLIC_APP_DOMAIN` mismatch → wallet login fails (domain binding).

4. **MEDIUM – Training flow not transactional**  
   Training submit: `updateStakeBalance` then `createStakeLedgerEntry`. If the second fails, balance is inconsistent. File: `server/routes.ts` lines 1266–1276.

5. **MEDIUM – No migration strategy**  
   `./migrations` is empty; schema sync relies on `db:push`. Production upgrades should use versioned migrations.

---

## B) Required Fixes Before Deploy (Blockers)

### 1. Training submit trust boundary – score must be server-verified

**What breaks:** Users can forge perfect scores and get full refunds; training economy is bypassable.  
**Why:** Score is computed from client-provided `answers` and `correctAnswers`.

**Files:** `server/routes.ts` lines 1213–1218

**Fix:** Load questions from DB and verify answers on the server.

```typescript
// BEFORE (client-trust):
if (body.answers && body.correctAnswers && body.answers.length > 0) {
  const correctCount = body.answers.reduce((count, answer, idx) => {
    return count + (answer === body.correctAnswers![idx] ? 1 : 0);
  }, 0);
  scorePct = correctCount / body.answers.length;
}

// AFTER (server-verify):
if (body.questionIds && body.answers && body.questionIds.length === body.answers.length) {
  const questions = await storage.getQuestionsByIds(body.questionIds);
  if (questions.length !== body.questionIds.length) {
    return res.status(400).json({ error: "Invalid question IDs" });
  }
  const correctCount = body.answers.reduce((count, answer, idx) => {
    return count + (questions[idx]?.correctIndex === answer ? 1 : 0);
  }, 0);
  scorePct = correctCount / body.answers.length;
} else {
  return res.status(400).json({ error: "questionIds and answers required and must match length" });
}
```

Add `getQuestionsByIds(ids: string[])` to storage and wire it in the submit route.

---

### 2. Deposit race condition – make confirm idempotent and atomic

**What breaks:** Two concurrent confirm calls for the same tx can both credit the wallet.  
**Why:** Check-then-act between `getStakeLedgerByTxSignature` and `createStakeLedgerEntry` is not atomic.

**File:** `server/routes.ts` lines 1044–1129

**Fix:** Wrap in a transaction; use `tx_signature` as the idempotency key and rely on DB uniqueness.

```typescript
// Replace lines 1050-1106 with transactional flow:
const result = await db.transaction(async (tx) => {
  const existingEntry = await tx.select().from(stakeLedger)
    .where(eq(stakeLedger.txSignature, body.txSignature)).limit(1);
  if (existingEntry.length > 0) {
    return { alreadyCredited: true, credited: parseFloat(existingEntry[0].amount), stakeAfter: ... };
  }
  // verify on chain...
  // update balance, insert ledger - all in same tx
  // On unique violation, tx rolls back
});
```

Alternatively, use advisory lock by `txSignature` before the check and release after the insert.

---

### 3. Required env vars must be validated at startup

**What breaks:** App starts, but deposit/creator/auth flows fail when `HIVE_VAULT_ADDRESS`, `HIVE_MINT`, `PUBLIC_APP_DOMAIN` are missing.  
**Why:** Config is read lazily; failures occur only when endpoints are hit.

**File:** `server/index.ts` (after line 43) and/or `server/dbInit.ts`

**Fix:** Add startup validation:

```typescript
// In initDatabase or before registerRoutes:
const required = ['DATABASE_URL'];
const forDeposit = ['HIVE_VAULT_ADDRESS', 'HIVE_MINT'];
const forAuth = ['PUBLIC_APP_DOMAIN'];
if (process.env.NODE_ENV === 'production') {
  for (const k of required) {
    if (!process.env[k]) throw new Error(`${k} is required`);
  }
  for (const k of forDeposit) {
    if (!process.env[k]) logger.warn({ var: k, message: `${k} missing - deposit flow will fail` });
  }
  if (!process.env.PUBLIC_APP_DOMAIN) {
    logger.warn({ message: 'PUBLIC_APP_DOMAIN missing - wallet login domain binding may fail' });
  }
}
```

---

### 4. Deposit flow must be transactional

**What breaks:** If `createStakeLedgerEntry` fails after `updateStakeBalance`, balance is credited but ledger is inconsistent.

**File:** `server/routes.ts` lines 1087–1105

**Fix:** Use a single DB transaction for balance update and ledger insert. Same transaction should include the duplicate-check (fix #2).

---

### 5. Training submit must be transactional

**What breaks:** If `createStakeLedgerEntry` or `addToRewardsPool` fails after `updateStakeBalance`, stake is deducted but ledger/rewards are inconsistent.

**File:** `server/routes.ts` lines 1264–1292

**Fix:** Wrap in `db.transaction()`: create attempt → update balance → create ledger → add to rewards pool. Roll back on any failure.

---

## C) Strong Recommendations (Non-blocking)

### 1. Align creator env var name

- **What:** `.env.example` has `CREATOR_WALLETS`, code uses `CREATOR_PUBLIC_KEY`.
- **File:** `Repl-GPT/.env.example` line 16; `server/auth.ts` line 9.
- **Fix:** Add `CREATOR_PUBLIC_KEY` to `.env.example`, document `CREATOR_WALLETS` as legacy or remove.

### 2. Remove or use JWT_SECRET

- **What:** `JWT_SECRET` is in `.env.example` but auth uses session tokens; `jsonwebtoken` is in deps but not used.
- **Files:** `Repl-GPT/.env.example` line 6; `package.json`.
- **Fix:** Either remove `JWT_SECRET` and JWT deps, or document if used elsewhere.

### 3. Add DB indices for hot paths

- **What:** `wallet_balances.wallet_address` is unique; `stake_ledger.tx_signature` unique; `sessions.session_token_hash` and `auth_nonces(wallet_address, nonce, used_at)` need indices for lookups.
- **File:** `shared/schema.ts`
- **Fix:** Ensure indices exist for:
  - `sessions(session_token_hash)` 
  - `auth_nonces(wallet_address, nonce)` 
  - `stake_ledger(wallet_address, created_at)` for history
  - `answer_events(wallet_address, attempt_id)`

### 4. Harden Sentry usage

- **What:** Sentry is optional; `captureError` checks DSN. Good.
- **File:** `server/sentry.ts`
- **Recommendation:** Confirm `sentryErrorHandler` is registered before other error handlers (it is at line 48 in `server/index.ts`). Ensure no PII in `beforeSend`/`setExtras`.

### 5. Double-check static asset path in production

- **What:** `static.ts` uses `path.resolve(__dirname, "public")`. In production, built server is `dist/index.cjs`, so `__dirname` = `dist/`, and Vite outputs to `dist/public`. Path is correct.
- **File:** `server/static.ts` line 6
- **Recommendation:** Run `npm run build && npm run start` and verify `/` serves the SPA.

---

## D) Environment Variable Matrix

| ENV_VAR | Where Used | Required/Optional | Default if Missing | Risk if Missing in Prod |
|---------|------------|-------------------|--------------------|--------------------------|
| DATABASE_URL | db.ts:12, drizzle.config.ts:12 | **Required** | Throws at startup | App won't start |
| JWT_SECRET | .env.example only | Optional | — | Unused in current auth |
| SESSION_SECRET | Not used | — | — | — |
| SOLANA_RPC_URL | routes.ts:115, solanaVerify.ts:4, solana.ts:5, health.ts:47, jupiter.ts | Optional | mainnet-beta.solana.com | Rate limits; slower RPC |
| HIVE_MINT | solana.ts:10, jupiter.ts:30, economy.ts:16, auth (via getHiveBalance) | **Required for deposit** | F3zvE... (hardcoded fallback) | Wrong mint if misconfigured |
| HIVE_VAULT_ADDRESS | economy.ts:15, solanaVerify.getDepositInfo | **Required for deposit** | "" | Deposit flow throws |
| OLLAMA_API_KEY | embedding.ts:4, aiChat.ts:6 | Optional | "" | Ollama may require auth |
| OLLAMA_BASE_URL | embedding.ts:3, aiChat.ts:7, routes.ts:151,168 | Optional | ollama.replit.dev / ollama.com | Wrong Ollama instance |
| OLLAMA_EMBED_DIM | embedding.ts:7 | Optional | 1024 | Mismatch with DB/embedding model |
| CREATOR_PUBLIC_KEY | auth.ts:9 | Optional | "" | Creator features disabled |
| CREATOR_WALLETS | .env.example only | — | — | Unused (code uses CREATOR_PUBLIC_KEY) |
| REWARDS_WALLET_ADDRESS | economy.ts:17 | Optional | "" | Sweep target unknown |
| ADMIN_EDIT_KEY | routes.ts:1711 | Optional | "" | Admin edit disabled |
| SENTRY_DSN | sentry.ts:3 | Optional | — | No error tracking |
| PUBLIC_APP_DOMAIN | auth.ts:11-14 | **Required for wallet auth** | REPL_SLUG.REPL_OWNER.repl.co or localhost | Login fails if domain mismatch |
| MIN_HIVE_ACCESS | auth.ts:20 | Optional | 50 | Different access threshold |
| PORT | index.ts:85 | Optional | 5000 | Wrong port if overridden |

---

## E) Test Checklist

Use this after deploy to verify production:

### 1. Health and readiness
- [ ] `GET /api/health` → `status: "up"` or `"degraded"` (not `"down"`)
- [ ] `GET /api/health/ready` → `status: "ready"`
- [ ] `GET /api/health/ollama` → `ok: true` when Ollama is running

### 2. Auth
- [ ] `GET /api/auth/nonce?wallet=<valid_solana_pubkey>` → nonce, message, expiresAt
- [ ] Sign message in wallet, `POST /api/auth/verify` with wallet, signature, nonce → `ok: true`, `Set-Cookie: sid`
- [ ] `GET /api/auth/status` (with cookie) → `authenticated: true`

### 3. Token gate
- [ ] With valid session: `GET /api/gate/status` → `hasAccess` based on HIVE balance
- [ ] With no/invalid session: `GET /api/gate/status` → 401 or `hasAccess: false`

### 4. Stake
- [ ] Authenticated: `GET /api/stake/status` → stakeHive, vaultAddress, mintAddress
- [ ] Authenticated: `GET /api/stake/deposit-info` → vaultOwner, vaultTokenAccount, mintAddress
- [ ] Send HIVE to vault ATA, then `POST /api/stake/confirm` with txSignature, amount → `success: true`, `credited`, `stakeAfter`
- [ ] Repeat same txSignature → 409 `duplicate_deposit`

### 5. Training submit
- [ ] With sufficient stake: `POST /api/train-attempts/submit` with trackId, difficulty, content, answers, correctAnswers, questionIds, startTime → attempt created, fee deducted
- [ ] With insufficient stake → 402 `insufficient_stake`
- [ ] Without HIVE access → 403 `HIVE_REQUIRED`

### 6. AI chat
- [ ] Authenticated + HIVE access: `POST /api/ai/chat` with message, aiLevel, trackId → response, corpusItemsUsed
- [ ] When Ollama down → graceful error (503 or "Official AI is offline")

### 7. Creator / admin
- [ ] Non-creator: creator-only endpoint → 403 `CREATOR_ONLY`
- [ ] Creator wallet: creator endpoint → success

### 8. Build and static
- [ ] `cd Repl-GPT && npm run build` succeeds
- [ ] `npm run start` serves SPA on `/`
- [ ] `curl https://<your-domain>/` returns HTML

### 9. CORS and cookies
- [ ] Requests from app origin get `Set-Cookie` with `SameSite=Lax`, `Secure` in prod
- [ ] Cross-origin preflight (if used) returns expected CORS headers

---

*Report generated from codebase scan. Address blockers before production deployment.*
