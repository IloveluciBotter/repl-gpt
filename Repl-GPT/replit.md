# Train Your AI - Quiz Game

## Overview

A gamified AI training quiz game where users answer multiple-choice questions to make their virtual AI companion smarter or dumber based on performance. The game features an unlimited level progression system, Solana wallet integration with token-gating, and persistent state via localStorage. Built with a modern dark-themed UI inspired by gamified learning apps like Duolingo and Habitica.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite with custom plugins for Replit integration
- **Styling**: Tailwind CSS with CSS custom properties for theming (dark mode default)
- **UI Components**: shadcn/ui component library (Radix UI primitives + Tailwind)
- **State Management**: React hooks with localStorage persistence for game state
- **Data Fetching**: TanStack React Query for API calls

### Backend Architecture
- **Runtime**: Node.js with Express
- **Language**: TypeScript with ESM modules
- **Build**: esbuild for production bundling with selective dependency bundling
- **Static Serving**: Express serves Vite-built frontend from `dist/public`
- **Authentication**: Secure nonce-based Solana wallet authentication with server-side sessions
  - Domain-bound message format prevents cross-domain replay attacks
  - Atomic nonce consumption prevents concurrent verification exploits
  - Session tokens stored as SHA-256 hashes in PostgreSQL
  - 7-day session expiry with httpOnly cookies
- **Rate Limiting**: Per-endpoint rate limits (IP-based for unauthenticated, wallet-based for authenticated)
  - Auth nonce/verify: 10/min/IP
  - Public read endpoints: 60/min/IP
  - Chat: 30/min/wallet + 60/min/IP
  - Submissions: 60/min/wallet
  - Corpus/review: 20/min/wallet
- **Structured Logging**: JSON logs via pino with request IDs, wallet addresses, and IP hashes
- **Audit Logging**: Database table tracking sensitive actions (logins, submissions, reviews, corpus changes, admin actions)

### Data Storage
- **Game State**: localStorage for client-side persistence (intelligence level, scores, sessions)
- **Database Schema**: PostgreSQL with Drizzle ORM (users table defined, ready for expansion)
- **Schema Location**: `shared/schema.ts` with Zod validation via drizzle-zod

### Key Design Patterns
- **Screen-based Navigation**: Single-page app with show/hide screens (home, training, result)
- **Component Composition**: Game components in `client/src/components/game/`, UI primitives in `client/src/components/ui/`
- **Shared Code**: `shared/` directory for code used by both client and server
- **Path Aliases**: `@/` for client source, `@shared/` for shared code

### Game Mechanics
- **Scoring Rules**: Pass thresholds scale by level (70% for L1-10, 80% for L11-20, 90% for L21+)
- **Unlimited Levels**: Dynamic difficulty scaling with no upper bound on currentLevel or maxUnlockedLevel
- **Question System**: 50 questions with complexity ratings (1-5), selected based on current level
- **Level Selection**: Players can choose any unlocked level (1 to maxUnlockedLevel)
- **AI Chat**: Intelligence-based responses that vary with intelligenceLevel (basic to elite)

### Cosmetics System
- **Style Credits**: Cosmetic-only currency (starts at 200)
  - Earn +20 credits for 90%+ session score
  - Earn +10 credits for 70-89% session score
  - Persisted to localStorage
- **Avatar Skins** (3 total):
  - Default Core (free) - emoji changes by intelligence level
  - Glitched Core (100 credits) - glitch animation effect
  - Overclocked Core (200 credits) - fire/heat animation effect
- **Aura Styles** (3 total):
  - Neon Blue Aura (50 credits) - blue glow
  - Neon Purple Aura (75 credits) - purple glow
  - Neon Green Aura (100 credits) - green glow
- **Shop UI**: Accessible from home screen, buy/equip cosmetics
- **State**: ownedSkins, ownedAuras, equippedSkin, equippedAura saved to localStorage

## External Dependencies

### Blockchain Integration
- **Solana Wallet**: Phantom wallet integration via window.solana provider (no external SDK)
- **Token Gating**: $MEME token balance check required (50 tokens minimum) to start training
- **RPC Endpoint**: Solana mainnet-beta API

### Database
- **PostgreSQL**: Required via `DATABASE_URL` environment variable
- **ORM**: Drizzle ORM with drizzle-kit for migrations

### UI/Design
- **Fonts**: DM Sans, Fira Code, Geist Mono via Google Fonts
- **Icons**: Lucide React
- **Component Primitives**: Full Radix UI suite (dialog, dropdown, toast, etc.)

### Key NPM Packages
- `@tanstack/react-query`: Server state management
- `drizzle-orm` + `drizzle-zod`: Database ORM with validation
- `class-variance-authority` + `clsx` + `tailwind-merge`: Styling utilities
- `react-hook-form` + `@hookform/resolvers`: Form handling
- `vaul`: Drawer component
- `embla-carousel-react`: Carousel functionality