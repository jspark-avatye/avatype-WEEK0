FROM node:20.20.2-bookworm-slim AS development

WORKDIR /workspace

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates openssl ffmpeg procps \
    && command -v ps > /dev/null \
    && rm -rf /var/lib/apt/lists/* \
    && corepack enable \
    && corepack prepare pnpm@10.18.1 --activate

COPY . .

# Use the workspace lockfile for reproducible dependency installation.
RUN if [ -f pnpm-lock.yaml ]; then pnpm install --frozen-lockfile; \
    else pnpm install --no-frozen-lockfile; fi
RUN pnpm --filter @root/trpc-contract build
RUN pnpm --filter @root/database build

CMD ["pnpm", "dev"]
