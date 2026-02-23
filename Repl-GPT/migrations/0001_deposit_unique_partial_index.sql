-- Migration 0001: enforce partial unique index on stake_ledger.tx_signature
-- Drizzle's .unique() generates a full unique constraint (NULLs are already
-- treated as distinct in Postgres, so non-deposit rows with NULL tx_signature
-- are unaffected). This partial index is an explicit belt-and-suspenders guard:
-- only one row per tx_signature is allowed when tx_signature IS NOT NULL.

-- Drop the existing constraint that was created by db:push (if present)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'stake_ledger_tx_signature_unique'
      AND conrelid = 'stake_ledger'::regclass
  ) THEN
    ALTER TABLE stake_ledger DROP CONSTRAINT stake_ledger_tx_signature_unique;
  END IF;
END $$;

-- Create explicit partial unique index (tx_signature NOT NULL rows only)
CREATE UNIQUE INDEX IF NOT EXISTS stake_ledger_tx_signature_partial_idx
  ON stake_ledger (tx_signature)
  WHERE tx_signature IS NOT NULL;
