# Root — English Conversation Assessment

TypeScript monorepo for the English conversation assessment platform. Workspace packages use the `@root/*` namespace.

## Workspace

- `apps/web` — React + Vite browser client
- `apps/api` — NestJS modular monolith and HTTP/RPC entry point
- `packages/trpc-contract` — shared tRPC router and client types
- `packages/database` — PostgreSQL Prisma schema and client package

The web follows Feature-Sliced Design. See the [frontend structure and import rules](apps/web/src/README.md) for layers, slices and public APIs.

The API boundary follows `docs/engineering/architecture.md`: tRPC procedures route through NestJS controllers, controllers invoke inbound ports, application services implement those ports, and outbound ports isolate database and external-service adapters. Domain rules and state remain encapsulated. Authentication and conversation models follow `docs/engineering/erd.md`; report models remain to be implemented.

The two-day implementation plan and completion criteria are documented in the [implementation roadmap](docs/engineering/implementation_roadmap.md).

The login-to-first-question journey is implemented: select a topic and starting level, check microphone access, then receive an AI-generated spoken question. See [first question behavior and verification](docs/engineering/first_question_implementation.md). Voice answers, STT, follow-up questions, bounded retries, pause/resume and ending at ANALYSIS_PENDING are implemented. See [conversation behavior and verification](docs/engineering/conversation_implementation.md). Reports are the next stage.

## Requirements

For the full container environment, use Docker Desktop (or Docker Engine) with Docker Compose. Start the Docker daemon before running the commands below. Node.js and pnpm on the host are not required for the container environment.

For running the applications directly on the host, use Node.js `20.20.2` and Corepack, then install dependencies with `corepack pnpm install`.

`npm run build`, `npm run dev` and the workspace commands also work when `pnpm` has not been enabled globally. They create a project-local Corepack shim, install workspace dependencies when the pnpm lockfile or installation metadata is absent, then execute the pinned pnpm version. For explicit installation or dependency updates, run `npm run setup`. Do not use `npm install` to install workspace dependencies; this repository uses pnpm workspace links. Commit the generated `pnpm-lock.yaml` after installation.

## Start everything with Docker

From the repository root:

```sh
docker compose up
```

The first start builds the development image and installs workspace dependencies. Compose starts PostgreSQL, Redis and MinIO, creates the `audio` bucket with a one-time `minio-init` container, rebuilds the shared tRPC contract and Prisma client from the mounted source, applies the authentication and conversation migrations, then starts the API and web after their dependencies are ready. `minio-init` exiting with code 0 is expected.

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

Local defaults allow startup without an `.env` file. To customize ports and credentials, copy `.env.example` to `.env` and edit the values. An existing `.env` is preserved. Set OPENAI_API_KEY before starting an assessment.

The browser calls the relative `/trpc` path on web. Vite forwards it to `http://api:3000` inside the Compose network. The API uses `postgres:5432`, `redis:6379` and `minio:9000`; these addresses do not use the host's published ports. Docker overrides the host-oriented connection settings from `.env.example` for these services.

API and web source, package scripts and tests are bind-mounted. Shared tRPC and database source/manifests are also mounted; each service rebuilds the relevant shared packages on startup so old image artifacts do not override current source. Application source uses watch mode/hot reload. Shared contract or schema changes require a service restart. Dependency additions/version changes, Dockerfile and non-mounted configuration changes require an image rebuild:

The development image includes `procps`: Nest CLI uses its `ps` command to stop child processes during watch-mode restarts. Rebuild the API image if an older container exits with `spawn ps ENOENT` after a source change.

```sh
docker compose up --build -d
docker compose logs -f web api
docker compose ps -a
docker compose down
```

After applying changes to the Compose mounts/startup commands, recreate the app containers:

```sh
docker compose up --build --force-recreate -d api web
docker compose exec api pnpm --filter @root/api ai:check
```

If `ai:check` reports that the selected package has no such script, the running container manifest differs from the host manifest. Recreate the app containers with the command above. The diagnostic command runs in the actual API environment; a successful host `npm run ai:check` alone does not verify container configuration.

PostgreSQL, Redis and MinIO data use named volumes and remain after `docker compose down`. `docker compose down -v` also deletes those local data volumes.

The image uses `--frozen-lockfile` when `pnpm-lock.yaml` exists.

Set `OPENAI_API_KEY` in `.env` before starting an assessment, then rebuild with `docker compose up --build -d`. STT/LLM/TTS model and voice settings are listed in `.env.example`. The API starts without a key, but AI jobs report the specific failure reason until a valid key is supplied. The image includes ffmpeg/ffprobe for actual MP3 duration validation. Rebuild is required for these new dependencies.

Prisma schema commands can run in the API container:

```sh
docker compose exec api pnpm db:validate
docker compose exec api pnpm db:migrate:deploy
docker compose exec api pnpm db:generate
```

Migrations under `packages/database/prisma` are bind-mounted back to the project. They create authentication, conversation and normalized report/result/feedback/evidence tables and are applied automatically when the API container starts. To apply them on a host-run API, use `corepack pnpm db:migrate:deploy` after PostgreSQL starts.

Open `http://localhost:5173/signup` to create an account, then sign in at `/login`. The browser keeps the Access JWT in memory and the server stores only a hash of the Refresh Token. Auth routes are tRPC procedures under `/trpc/auth.*`.

## Commands

- `corepack pnpm dev` — run web and API in watch mode
- `corepack pnpm build` — build all packages
- `corepack pnpm typecheck` — check TypeScript
- `corepack pnpm lint` — lint the entire monorepo with ESLint; explicit `any` is an error
- `corepack pnpm lint:fix` — apply ESLint auto-fixes
- `npm run ai:check` — diagnose LLM/TTS using the configured API key without printing secrets (small API usage)
- `corepack pnpm test:auth` — run the auth integration flow against a running API and migrated database
- `corepack pnpm test:evaluation` — run conversation, multipart transport, recorder, token-refresh and React rendering tests
- `npm run test:render` — render the actual React pages against normal, previous and malformed evaluation responses
- `corepack pnpm test:evaluation:integration` — run the real first-question/control flow; supply EVALUATION_TEST_AUDIO for an actual STT round trip
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

## Assessment reports

Conversation endings automatically schedule `report-analysis`. Reports combine full-recording audio observations (`gpt-audio-1.5`) with structured assessment (`gpt-4o-mini`). Settings are in `.env.example`. Recreate the apps to apply the new schema and settings:

```sh
docker compose up --build --force-recreate -d api web
docker compose exec api pnpm --filter @root/api report:check
```

`report:check` makes real API calls with a synthetic voice by default (small API usage), without saving a report or printing recordings/transcripts/keys. A real recording can be checked by supplying `REPORT_TEST_AUDIO` and `REPORT_TEST_TRANSCRIPT` in the API container. A synthetic diagnostic verifies API configuration, not a human speech assessment.

Report pages are `/evaluations/{evaluationId}/report`; history is `/evaluations`. User current level is derived from the latest confirmed report rather than duplicated in a user column. The migration requires the legacy level column to be NULL before removal.

- `npm run test:report` — report policy, use cases, SDK boundaries, Nest wiring, RPC and React/browser-bundle regressions
- `npm run test:report:db` — real PostgreSQL constraints, atomic writes, evidence ownership and level ordering; creates and removes only its own test records
- `npm run test:report:integration` — running-stack unanswered report flow; supply `REPORT_TEST_AUDIO` for real STT/audio analysis/evidence playback
- `npm run report:check` — real audio-model/final-report model diagnostic

Details and current verification limits: [report implementation](docs/engineering/report_implementation.md).
