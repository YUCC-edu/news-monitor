# --- Stage 1: install deps and build ---
FROM node:22-alpine AS builder

RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /repo

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/ai/package.json packages/ai/package.json
COPY packages/connectors/core/package.json packages/connectors/core/package.json
COPY packages/connectors/hn/package.json packages/connectors/hn/package.json
COPY packages/connectors/rss/package.json packages/connectors/rss/package.json
COPY packages/connectors/wechat-wewe/package.json packages/connectors/wechat-wewe/package.json
COPY packages/connectors/x-rsshub/package.json packages/connectors/x-rsshub/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/engine/package.json packages/engine/package.json

RUN pnpm install --frozen-lockfile

COPY packages packages
COPY apps/web apps/web

RUN NEXT_STANDALONE=1 pnpm --filter @news/web build

# --- Stage 2: runtime ---
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

COPY --from=builder /repo/apps/web/.next/standalone ./
COPY --from=builder /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /repo/apps/web/public ./apps/web/public

EXPOSE 3000
CMD ["node", "apps/web/server.js"]
