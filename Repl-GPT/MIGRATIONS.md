# Database migrations

## Development

Use Drizzle push to sync schema from code:

```bash
npm run db:push
```

This applies schema changes directly without migration files. Suitable for local/dev only.

## Production

For production, prefer explicit migrations. Options:

1. **Manual SQL execution**: Run migration files against the production DB in order.
2. **Drizzle migrations**: If using `drizzle-kit generate`, run generated migrations with `drizzle-kit migrate`.

## Required migration: tx_signature partial unique index

This migration prevents duplicate deposit credits (race condition fix). **Must be applied in production** if not already present.

**File**: `migrations/0001_deposit_unique_partial_index.sql`

**How to apply**:
```bash
psql $DATABASE_URL -f migrations/0001_deposit_unique_partial_index.sql
```

Or via your DB provider's SQL console: paste the contents of the file and execute.

**What it does**:
- Drops the full unique constraint on `stake_ledger.tx_signature` (if present).
- Creates a partial unique index on `tx_signature` WHERE `tx_signature IS NOT NULL`.
- Allows idempotent deposit confirmation via `ON CONFLICT DO NOTHING` on `tx_signature`.
