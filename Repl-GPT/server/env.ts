/**
 * Startup environment validation.
 * Import this at the very top of server/index.ts before anything else.
 * In production, missing required vars cause an immediate process.exit(1).
 */

export const isProd = process.env.NODE_ENV === "production";
export const isDev = !isProd;

interface VarSpec {
  name: string;
  required: boolean;
  warn?: string; // print a warning instead of erroring
}

const vars: VarSpec[] = [
  // Hard-required in production
  { name: "DATABASE_URL", required: true },
  { name: "PUBLIC_APP_DOMAIN", required: true },
  { name: "SOLANA_RPC_URL", required: true },
  { name: "HIVE_MINT", required: true },
  { name: "HIVE_VAULT_ADDRESS", required: true },
  { name: "BOOTSTRAP_ADMIN_KEY", required: true },

  // Optional with warnings
  { name: "SENTRY_DSN", required: false, warn: "Server-side Sentry error tracking will be disabled" },
  { name: "REWARDS_WALLET_ADDRESS", required: false, warn: "No rewards wallet configured; reward sweeps will fail" },
];

// Unused in server code as of this audit, noted here for visibility:
// JWT_SECRET - not referenced in any server/*.ts file

function validate(): void {
  if (!isProd) {
    // In development, skip required checks but still print warnings for optional
    const missing = vars.filter(v => v.warn && !process.env[v.name]);
    for (const v of missing) {
      console.warn(`[env] WARNING: ${v.name} not set — ${v.warn}`);
    }
    return;
  }

  // Production: collect all missing required vars
  const missingRequired = vars
    .filter(v => v.required && !process.env[v.name])
    .map(v => v.name);

  if (missingRequired.length > 0) {
    console.error("[env] FATAL: Missing required environment variables:");
    for (const name of missingRequired) {
      console.error(`  - ${name}`);
    }
    console.error("[env] Server cannot start. Set the variables above and retry.");
    process.exit(1);
  }

  // Warn on optional missing
  const missingOptional = vars.filter(v => v.warn && !process.env[v.name]);
  for (const v of missingOptional) {
    console.warn(`[env] WARNING: ${v.name} not set — ${v.warn}`);
  }
}

validate();
