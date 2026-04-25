# --- Stage 1: install deps & build ---
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

RUN pnpm install --frozen-lockfile

COPY packages packages
COPY apps/web apps/web

RUN pnpm --filter @news/web build

# --- Stage 2: runtime ---
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# 复制 web 应用（standalone 输出依赖 next.config 设置；此处用普通模式）
COPY --from=builder /repo/node_modules ./node_modules
COPY --from=builder /repo/packages ./packages
COPY --from=builder /repo/apps/web ./apps/web
COPY --from=builder /repo/package.json ./package.json
COPY --from=builder /repo/pnpm-workspace.yaml ./pnpm-workspace.yaml

EXPOSE 3000
WORKDIR /app/apps/web
CMD ["node", "node_modules/next/dist/bin/next", "start", "-H", "0.0.0.0", "-p", "3000"]
