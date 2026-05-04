# --- Stage 1: install workspace deps ---
FROM node:22-alpine AS builder

RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /repo

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/worker/package.json apps/worker/package.json
COPY packages/ai/package.json packages/ai/package.json
COPY packages/connectors/core/package.json packages/connectors/core/package.json
COPY packages/connectors/hn/package.json packages/connectors/hn/package.json
COPY packages/connectors/rss/package.json packages/connectors/rss/package.json
COPY packages/connectors/wechat-wewe/package.json packages/connectors/wechat-wewe/package.json
COPY packages/connectors/x-rsshub/package.json packages/connectors/x-rsshub/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/engine/package.json packages/engine/package.json

RUN pnpm install --frozen-lockfile

COPY apps/worker apps/worker
COPY packages packages

# --- Stage 2: runtime ---
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /repo/node_modules ./node_modules
COPY --from=builder /repo/apps/worker ./apps/worker
COPY --from=builder /repo/packages ./packages
COPY --from=builder /repo/package.json ./package.json
COPY --from=builder /repo/pnpm-workspace.yaml ./pnpm-workspace.yaml

CMD ["./node_modules/.bin/tsx", "apps/worker/src/index.ts"]
