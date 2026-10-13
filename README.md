# Root — English Conversation Assessment

TypeScript monorepo for the English conversation assessment platform. Workspace packages use the `@root/*` namespace.

## Workspace

- `apps/web` — React + Vite browser client
- `apps/api` — NestJS modular monolith and HTTP/RPC entry point
- `packages/trpc-contract` — shared tRPC router and client types
- `packages/database` — PostgreSQL Prisma schema and client package

The web follows Feature-Sliced Design. See the [frontend structure and import rules](apps/web/src/README.md) for layers, slices and public APIs.

The API boundary follows `docs/engineering/architecture.md`: tRPC procedures route through NestJS controllers, controllers invoke inbound ports, application services implement those ports, and outbound ports isolate database and external-service adapters. Domain rules and state remain encapsulated. The authentication tables follow `docs/engineering/erd.md`; evaluation models remain to be implemented.

The two-day implementation plan and completion criteria are documented in the [implementation roadmap](docs/engineering/implementation_roadmap.md).

## Requirements

For the full container environment, use Docker Desktop (or Docker Engine) with Docker Compose. Start the Docker daemon before running the commands below. Node.js and pnpm on the host are not required for the container environment.

For running the applications directly on the host, use Node.js `20.20.2` and Corepack, then install dependencies with `corepack pnpm install`.

## Start everything with Docker

From the repository root:

```sh
docker compose up
```

The first start builds the development image and installs workspace dependencies. Compose starts PostgreSQL, Redis and MinIO, creates the `audio` bucket with a one-time `minio-init` container, applies the authentication migration, then starts the API and web after their dependencies are ready. `minio-init` exiting with code 0 is expected.

The Compose `minio` service uses [Silo](https://github.com/pgsty/silo), a MinIO-compatible fork, because the original `minio/minio` and `minio/mc` Docker Hub images are no longer publicly pullable. The service name, S3 endpoint, credentials and bucket setup remain the same. Both images are pinned to the same release.

| Service | Host address |
| --- | --- |
| React web | http://localhost:5173 |
| NestJS API health | http://localhost:3000/health |
| tRPC through web | http://localhost:5173/trpc/health |
| PostgreSQL | localhost:5432 |
| Redis | localhost:6379 |
| MinIO API | http://localhost:9000 |
| MinIO console | http://localhost:9001 |

Local defaults allow startup without an `.env` file. To customize ports and credentials, copy `.env.example` to `.env` and edit the values. An existing `.env` is preserved. Add the AI API key when implementing AI integration.

The browser calls the relative `/trpc` path on web. Vite forwards it to `http://api:3000` inside the Compose network. The API uses `postgres:5432`, `redis:6379` and `minio:9000`; these addresses do not use the host's published ports. Docker overrides the host-oriented connection settings from `.env.example` for these services.

API and web source directories are bind-mounted for watch mode and hot reload. Dependency manifests, shared tRPC contracts, Dockerfile and non-mounted configuration changes require a rebuild:

```sh
docker compose up --build -d
docker compose logs -f web api
docker compose ps -a
docker compose down
```

PostgreSQL, Redis and MinIO data use named volumes and remain after `docker compose down`. `docker compose down -v` also deletes those local data volumes.

The bootstrap has no committed pnpm lockfile yet, so the first image build resolves dependencies. Once `pnpm-lock.yaml` is committed, the image uses `--frozen-lockfile`.

Prisma schema commands can run in the API container:

```sh
docker compose exec api pnpm db:validate
docker compose exec api pnpm db:migrate:deploy
docker compose exec api pnpm db:generate
```

Migrations under `packages/database/prisma` are bind-mounted back to the project. The authentication migration creates `user_account` and `refresh_token` and is applied automatically when the API container starts. To apply it on a host-run API, use `corepack pnpm db:migrate:deploy` after PostgreSQL starts.

Open `http://localhost:5173/signup` to create an account, then sign in at `/login`. The browser keeps the Access JWT in memory and the server stores only a hash of the Refresh Token. Auth routes are tRPC procedures under `/trpc/auth.*`.

## Commands

- `corepack pnpm dev` — run web and API in watch mode
- `corepack pnpm build` — build all packages
- `corepack pnpm typecheck` — check TypeScript
- `corepack pnpm lint` — lint the entire monorepo with ESLint; explicit `any` is an error
- `corepack pnpm lint:fix` — apply ESLint auto-fixes
- `corepack pnpm test:auth` — run the auth integration flow against a running API and migrated database
- `corepack pnpm infra:up` — build and start web, API, PostgreSQL, Redis, MinIO-compatible storage and bucket initialization
- `corepack pnpm infra:down` — stop the Compose environment
- `corepack pnpm stack:up` / `corepack pnpm stack:down` — build/start or stop the full Compose environment
- `corepack pnpm stack:logs` — follow web/API container logs
- `corepack pnpm db:generate` — generate Prisma Client
- `corepack pnpm db:validate` — validate Prisma schema
- `corepack pnpm db:migrate:dev` — create/apply a local migration (requires PostgreSQL)
- `corepack pnpm db:migrate:deploy` — apply committed migrations (requires PostgreSQL)

Web: `http://localhost:5173`; API health: `http://localhost:3000/health`.

The ESLint flat config is shared by all workspaces. Use a precise type or `unknown` with narrowing instead of `any`. TypeScript's strict settings also reject implicit `any` during `typecheck`.
