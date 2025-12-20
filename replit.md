# HiveMind $HIVE System

## Overview

HiveMind is a decentralized AI training platform built as a gamified quiz game where users answer multiple-choice questions to train a virtual AI companion. The system features Solana wallet integration with token gating, requiring users to hold HIVE tokens to access core features. Users submit training attempts that go through a consensus-based review system, with approved submissions contributing to model training and earning token rewards.

The platform includes an unlimited level progression system, weekly training cycles, phrase mining, and a cosmetics system with style credits. Training economics include token staking, locking mechanisms, and a training pool for rejected submissions.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite with custom Replit integration plugins
- **Styling**: Tailwind CSS with CSS custom properties for dark theme (default)
- **UI Components**: shadcn/ui component library built on Radix UI primitives
- **State Management**: React hooks with localStorage persistence for game state
- **Data Fetching**: TanStack React Query for API calls
- **Path Aliases**: `@/` maps to `client/src/`, `@shared/` maps to `shared/`

### Backend Architecture
- **Runtime**: Node.js with Express
- **Language**: TypeScript with ESM modules
- **Build**: esbuild for production bundling
- **Authentication**: JWT tokens stored in httpOnly cookies with Solana wallet signature verification
- **Token Gate**: Requires minimum USD value of HIVE tokens (configurable via `MIN_USD_ACCESS`)
- **Static Serving**: Express serves Vite-built frontend from `dist/public`

### Data Storage
- **Database**: PostgreSQL with Drizzle ORM
- **Schema Location**: `shared/schema.ts` with Zod validation via drizzle-zod
- **Client State**: localStorage for game progress (intelligence level, scores, sessions)
- **Tables**: users, tracks, questions, phrases, train_attempts, reviews, locks, model_versions, benchmarks, hub_posts, hub_submissions, cycles, training_pool

### Key Design Patterns
- **Screen-based Navigation**: Single-page app with show/hide screens (home, training, result, chat, corpus)
- **Component Structure**: Game components in `client/src/components/game/`, UI primitives in `client/src/components/ui/`
- **Shared Code**: `shared/` directory for code used by both client and server
- **Consensus Review**: 2-of-3 for low/medium difficulty, 3-of-5 for high/extreme difficulty submissions
- **Weekly Cycles**: Automated cycle processing with phrase mining and model versioning

### Game Mechanics
- **Scoring Rules**: Pass thresholds scale by level (70% L1-10, 80% L11-20, 90% L21+)
- **Question System**: 50 questions with complexity ratings (1-5), selected based on current level
- **Training Economics**: 80% refund on approval (liquid), 20% locked for 4 cycles, rejected submissions split 50% burn / 50% to training pool
- **Style Credits**: Cosmetic currency earned based on session performance

## External Dependencies

### Blockchain Integration
- **Solana Web3.js**: `@solana/web3.js` for wallet interactions and token balance checks
- **Jupiter Price API**: Fetches HIVE token USD price with 60-second caching
- **Phantom Wallet**: Primary wallet integration for authentication
- **Environment Variables**: `SOLANA_RPC_URL`, `HIVE_MINT` for Solana configuration

### Authentication
- **jsonwebtoken**: JWT token generation and verification
- **tweetnacl**: Solana ed25519 signature verification
- **cookie-parser**: HTTP-only cookie handling for JWT storage
- **Environment Variables**: `JWT_SECRET` for token signing

### Database
- **PostgreSQL**: Primary data store (requires `DATABASE_URL` environment variable)
- **Drizzle ORM**: Type-safe database queries and schema management
- **drizzle-kit**: Database migrations and schema push (`npm run db:push`)
- **connect-pg-simple**: Session storage (if needed)

### UI Libraries
- **Radix UI**: Full suite of accessible UI primitives (dialog, dropdown, tabs, etc.)
- **TanStack React Query**: Server state management and caching
- **class-variance-authority**: Component variant styling
- **cmdk**: Command menu component

### Build Tools
- **Vite**: Frontend bundling with React plugin
- **esbuild**: Production server bundling
- **TypeScript**: Type checking across client and server
- **Tailwind CSS**: Utility-first styling with custom theme configuration