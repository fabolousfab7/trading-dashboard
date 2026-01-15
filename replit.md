# Trading Journal Application

## Overview

A full-stack trading journal application that allows traders to log, track, and analyze their trades. The app provides a dashboard for recording trade details (asset, strategy, profit/loss, risk, timeframe) with photo attachments, and displays performance statistics. Built with React frontend, Express backend, and Supabase for authentication and data storage.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter (lightweight alternative to React Router)
- **State Management**: TanStack React Query for server state
- **UI Components**: shadcn/ui component library built on Radix UI primitives
- **Styling**: Tailwind CSS with custom cyberpunk-themed design system (dark mode with neon accents)
- **Animations**: Framer Motion for UI transitions
- **Build Tool**: Vite with custom path aliases (@/, @shared/, @assets/)

### Backend Architecture
- **Runtime**: Node.js with Express
- **Language**: TypeScript (ESM modules)
- **API Pattern**: RESTful endpoints defined in `shared/routes.ts` with Zod validation
- **Authentication**: JWT-based auth using Supabase Auth - tokens passed via Authorization header
- **Database ORM**: Drizzle ORM with PostgreSQL dialect

### Data Layer
- **Primary Database**: Supabase (PostgreSQL)
- **Schema Location**: `shared/schema.ts` using Drizzle table definitions
- **Migrations**: Drizzle Kit with migrations output to `./migrations`
- **Schema Sharing**: Types and schemas shared between client and server via `@shared/*` alias

### Build & Development
- **Development**: `tsx` for running TypeScript directly
- **Production Build**: Custom build script using esbuild for server, Vite for client
- **Output**: Server bundles to `dist/index.cjs`, client to `dist/public`

### Key Design Decisions

1. **Supabase over custom auth**: Simplifies authentication with built-in user management, email auth, and row-level security
2. **Shared schema between client/server**: Single source of truth for types and validation using Drizzle-Zod
3. **shadcn/ui components**: Copy-paste component model allows full customization without package dependencies
4. **Monorepo structure**: Client, server, and shared code in single repository with path aliases

## External Dependencies

### Third-Party Services
- **Supabase**: Authentication and PostgreSQL database hosting
  - Environment variables: `SUPABASE_URL`, `SUPABASE_ANON_KEY` (server)
  - Environment variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (client)

### Database
- **PostgreSQL**: Via Supabase, connection string in `DATABASE_URL`
- **Schema**: Single `trades` table with columns for trade details, user association, and photo attachments (JSONB)

### Key NPM Dependencies
- `@supabase/supabase-js`: Supabase client for auth and database operations
- `drizzle-orm` / `drizzle-kit`: Database ORM and migration tooling
- `@tanstack/react-query`: Async state management
- `zod` / `drizzle-zod`: Schema validation and type generation
- `framer-motion`: Animation library
- Full Radix UI primitive suite for accessible components