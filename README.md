# Root — English Conversation Assessment

TypeScript monorepo for the English conversation assessment platform. Workspace packages use the `@root/*` namespace.

## Workspace

- `apps/web` — React + Vite browser client
- `apps/api` — NestJS modular monolith and HTTP/RPC entry point
- `packages/trpc-contract` — shared tRPC router and client types
- `packages/database` — PostgreSQL Prisma schema and client package

The API boundary follows `docs/engineering/architecture.md`: tRPC procedures route through NestJS controllers, controllers invoke inbound ports, application services implement those ports, and outbound ports isolate database and external-service adapters. Domain rules and state remain encapsulated. Prisma schema work should follow `docs/engineering/erd.md`; this bootstrap intentionally does not invent table definitions.

## Requirements

Node.js `20.20.2` (or a compatible Node 20 release) and Corepack. Install dependencies with `corepack pnpm install`.

Copy `.env.example` to `.env` and set local values. Existing local `.env` files are ignored and are not overwritten by this scaffold.

## Commands

- `corepack pnpm dev` — run web and API in watch mode
- `corepack pnpm build` — build all packages
- `corepack pnpm typecheck` — check TypeScript
- `corepack pnpm infra:up` / `corepack pnpm infra:down` — start/stop PostgreSQL, Redis and MinIO
- `corepack pnpm db:generate` — generate Prisma Client
- `corepack pnpm db:validate` — validate Prisma schema
- `corepack pnpm db:migrate:dev` — create/apply a local migration (requires PostgreSQL)

Web: `http://localhost:5173`; API health: `http://localhost:3000/health`.
