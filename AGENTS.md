# AGENTS.md

## Cursor Cloud specific instructions

### Overview

HiveMind ($HIVE) is a decentralized AI training platform (gamified quiz game on Solana). It is a monolithic full-stack app: a single Express server that serves both a REST API and a React SPA via Vite.

- **Frontend:** React 18 + TypeScript + Vite + Tailwind CSS + shadcn/ui (in `Repl-GPT/client/`)
- **Backend:** Node.js 20 + Express (TypeScript, ESM) (in `Repl-GPT/server/`)
- **Database:** PostgreSQL 16 with `pgvector` and `pgcrypto` extensions
- **ORM:** Drizzle ORM; schema in `Repl-GPT/shared/schema.ts`

### Required services

| Service | How to start | Notes |
|---------|-------------|-------|
| PostgreSQL 16 | `sudo pg_ctlcluster 16 main start` | Must have `pgvector` + `pgcrypto` extensions enabled |

### Environment variables

`DATABASE_URL` must be set (e.g. `postgresql://hivemind:hivemind@localhost:5432/hivemind`). It is already persisted in `~/.bashrc`. In dev mode, all other env vars are optional — the server prints warnings but starts fine.

### Key commands (all run from `Repl-GPT/`)

| Action | Command |
|--------|---------|
| Dev server | `npm run dev` (serves on port 5000, both API + frontend with HMR) |
| TypeScript check | `npm run check` (runs `tsc --noEmit`) |
| Build | `npm run build` |
| DB schema push | `DATABASE_URL=... npm run db:push` |
| Seed data | `DATABASE_URL=... npm run seed` |

### Gotchas

- The root `/workspace/package.json` has separate dependencies from `/workspace/Repl-GPT/package.json`. Both need `npm install`. The actual app lives in `Repl-GPT/`.
- There is no ESLint configuration and no test suite; the only lint-like check is `npm run check` (TypeScript).
- The `.replit` file specifies `nodejs-20` — use Node.js 20 (via nvm).
- Wallet auth requires a Phantom browser extension and Solana HIVE tokens; in dev without these, the app still loads and shows the landing page.
- Ollama (AI chat) is optional; when unconfigured, health endpoint reports "degraded" status but the app runs fine.
- The Vite dev server is embedded in Express (middleware mode), so there is only one process/port (5000).
