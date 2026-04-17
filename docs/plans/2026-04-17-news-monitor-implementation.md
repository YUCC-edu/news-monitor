# news-monitor Implementation Plan

> **For agentic workers:** Implement task-by-task using checkbox (`- [ ]`) tracking. After each task: run the listed verification command, then commit. Do NOT skip ahead.

**Goal:** 自用单机的多源资讯监控大屏：5–10 分钟内把 RSS / Hacker News / X (RSSHub) 的新内容采集、翻译、打标签、聚类后呈现到 Web 大屏，并对关键词命中弹桌面通知。

**Architecture:** pnpm monorepo；`apps/web`（Next.js App Router 提供 UI + API + SSE）和 `apps/worker`（独立 Node 进程跑 BullMQ 调度 + connector + AI 流水线）；底座 Postgres(pgvector) + Redis；通过 Docker Compose 一键起。

**Tech Stack:** Node 22, TypeScript, pnpm, Next.js 15, NextAuth, Drizzle ORM, BullMQ, Postgres 16 (pgvector), Redis 7, RSSHub, ECharts, OpenAI 兼容 LLM 客户端，Vitest（单元）、Playwright（端到端，可选）。

> **运行约定**
> - 全部命令在 `C:\Users\yccva\dev\news-monitor\` 下执行（PowerShell）。
> - 每个 Task 末尾都必须执行 git commit；如果还没 init，第一个任务里会做。
> - 命令统一用 pnpm；Docker 命令需本机已安装 Docker Desktop。

---

## File Structure（建好后的目标形态）

```
news-monitor/
├── apps/
│   ├── web/
│   │   ├── app/                       # Next.js App Router
│   │   │   ├── (auth)/login/page.tsx
│   │   │   ├── (dash)/layout.tsx
│   │   │   ├── (dash)/page.tsx        # 时间轴
│   │   │   ├── (dash)/sources/page.tsx
│   │   │   ├── (dash)/health/page.tsx
│   │   │   ├── (dash)/stats/page.tsx
│   │   │   ├── (dash)/keywords/page.tsx
│   │   │   ├── api/auth/[...nextauth]/route.ts
│   │   │   ├── api/sources/route.ts
│   │   │   ├── api/sources/[id]/route.ts
│   │   │   ├── api/items/route.ts
│   │   │   ├── api/keywords/route.ts
│   │   │   └── api/stream/route.ts    # SSE
│   │   ├── components/                # 大屏 UI 组件
│   │   ├── lib/
│   │   │   ├── auth.ts
│   │   │   └── sse-bus.ts             # 订阅 Redis → 推 SSE
│   │   ├── middleware.ts              # 鉴权
│   │   ├── next.config.ts
│   │   └── package.json
│   └── worker/
│       ├── src/
│       │   ├── index.ts               # 入口；启动调度
│       │   ├── scheduler.ts           # 注册/同步 repeat jobs
│       │   ├── jobs/
│       │   │   ├── fetch-source.ts
│       │   │   ├── enrich-item.ts
│       │   │   └── name-cluster.ts
│       │   ├── pipeline/
│       │   │   ├── translate-tag.ts
│       │   │   └── cluster.ts
│       │   └── ipc/
│       │       └── publish.ts         # Redis Pub/Sub 发件
│       └── package.json
├── packages/
│   ├── db/
│   │   ├── src/
│   │   │   ├── client.ts
│   │   │   ├── schema.ts              # Drizzle schema
│   │   │   └── index.ts
│   │   ├── drizzle/                   # 自动生成的迁移
│   │   ├── drizzle.config.ts
│   │   └── package.json
│   ├── connectors/
│   │   ├── core/
│   │   │   ├── src/
│   │   │   │   ├── types.ts           # Connector 接口、NormalizedItem
│   │   │   │   ├── registry.ts        # kind → connector 实例
│   │   │   │   └── index.ts
│   │   │   └── package.json
│   │   ├── rss/
│   │   │   ├── src/index.ts
│   │   │   ├── tests/rss.test.ts
│   │   │   └── package.json
│   │   ├── hn/
│   │   │   ├── src/index.ts
│   │   │   ├── tests/hn.test.ts
│   │   │   └── package.json
│   │   └── x-rsshub/
│   │       ├── src/index.ts
│   │       └── package.json
│   ├── ai/
│   │   ├── src/
│   │   │   ├── llm-client.ts          # OpenAI 兼容
│   │   │   ├── translate-tag.ts
│   │   │   └── embeddings.ts
│   │   ├── tests/
│   │   └── package.json
│   └── shared/
│       ├── src/
│       │   ├── tags.ts                # 受控标签词表
│       │   ├── lang.ts                # CJK 启发式
│       │   └── env.ts                 # 环境变量解析（zod）
│       └── package.json
├── docker/
│   ├── web.Dockerfile
│   ├── worker.Dockerfile
│   └── compose.yaml
├── docs/
│   ├── specs/2026-04-17-news-monitor-design.md
│   └── plans/2026-04-17-news-monitor-implementation.md
├── .env.example
├── pnpm-workspace.yaml
├── package.json
├── tsconfig.base.json
└── README.md
```

---

# M0 — 脚手架与登录大屏

> **完成态**：`docker compose up -d` 后能在 `http://localhost:3000` 登录并看到一个空的「时间轴」页面（无数据）。无需 connector，无需 AI。

## Task 0.1: 初始化仓库与 monorepo

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `README.md`

- [ ] **Step 1：初始化 git 仓库**

```powershell
cd C:\Users\yccva\dev\news-monitor
git init
git branch -M main
```

- [ ] **Step 2：写根 `package.json`**

```json
{
  "name": "news-monitor",
  "private": true,
  "packageManager": "pnpm@9.12.0",
  "scripts": {
    "dev:web": "pnpm --filter @news/web dev",
    "dev:worker": "pnpm --filter @news/worker dev",
    "build": "pnpm -r build",
    "lint": "pnpm -r lint",
    "test": "pnpm -r test"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "tsx": "^4.19.0"
  }
}
```

- [ ] **Step 3：写 `pnpm-workspace.yaml`**

```yaml
packages:
  - "apps/*"
  - "packages/*"
  - "packages/connectors/*"
```

- [ ] **Step 4：写 `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": false,
    "lib": ["ES2022", "DOM"]
  }
}
```

- [ ] **Step 5：写 `.gitignore`**

```
node_modules/
.next/
dist/
.env
.env.local
backups/
docker/.data/
```

- [ ] **Step 6：写 `.env.example`**（占位，后续补充）

```
# --- Auth ---
AUTH_SECRET=replace-me
AUTH_USER=admin
AUTH_PASS_HASH=               # bcrypt hash; tooling 在 M0 末尾给出

# --- Database ---
DATABASE_URL=postgres://news:news@postgres:5432/news

# --- Redis ---
REDIS_URL=redis://redis:6379

# --- RSSHub ---
RSSHUB_BASE=http://rsshub:1200

# --- LLM (OpenAI 兼容) ---
LLM_BASE_URL=https://api.openai.com/v1
LLM_API_KEY=
LLM_CHAT_MODEL=gpt-4o-mini
LLM_EMBEDDING_MODEL=text-embedding-3-small
```

- [ ] **Step 7：安装 root devDependencies**

```powershell
pnpm install
```

预期：生成 `pnpm-lock.yaml`，无 workspace 包警告（因还没建子包）。

- [ ] **Step 8：提交**

```powershell
git add -A
git commit -m "chore: init monorepo scaffolding"
```

---

## Task 0.2: 建 `packages/shared`（env 解析 + 受控标签）

**Files:**
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/src/env.ts`
- Create: `packages/shared/src/tags.ts`
- Create: `packages/shared/src/lang.ts`
- Create: `packages/shared/src/index.ts`
- Create: `packages/shared/tests/lang.test.ts`

- [ ] **Step 1：写 `package.json`**

```json
{
  "name": "@news/shared",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "scripts": {
    "test": "vitest run"
  },
  "dependencies": { "zod": "^3.23.0" },
  "devDependencies": { "vitest": "^2.1.0" }
}
```

- [ ] **Step 2：写 `tsconfig.json`**

```json
{ "extends": "../../tsconfig.base.json", "include": ["src", "tests"] }
```

- [ ] **Step 3：写 `src/env.ts`** — 用 zod 解析必需变量，缺失立刻抛错。

```ts
import { z } from "zod";
const Schema = z.object({
  AUTH_SECRET: z.string().min(8),
  AUTH_USER: z.string().min(1),
  AUTH_PASS_HASH: z.string().min(1),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  RSSHUB_BASE: z.string().url(),
  LLM_BASE_URL: z.string().url(),
  LLM_API_KEY: z.string().optional().default(""),
  LLM_CHAT_MODEL: z.string().default("gpt-4o-mini"),
  LLM_EMBEDDING_MODEL: z.string().default("text-embedding-3-small"),
});
export const env = Schema.parse(process.env);
export type Env = z.infer<typeof Schema>;
```

- [ ] **Step 4：写 `src/tags.ts`** — 受控标签词表（首版 10 个，后续可加）

```ts
export const CONTROLLED_TAGS = [
  "Agent","模型发布","编码","大佬观点","安全",
  "数据集","多模态","推理","硬件","行业新闻"
] as const;
export type ControlledTag = (typeof CONTROLLED_TAGS)[number];
```

- [ ] **Step 5：写失败测试 `tests/lang.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { detectLangSimple } from "../src/lang";

describe("detectLangSimple", () => {
  it("detects zh when CJK ratio >= 0.3", () => {
    expect(detectLangSimple("OpenAI 发布了 Claude Opus 4.7")).toBe("zh");
  });
  it("detects en when no CJK", () => {
    expect(detectLangSimple("Anthropic released Claude Opus 4.7")).toBe("en");
  });
});
```

- [ ] **Step 6：跑测试确认 FAIL**

```powershell
pnpm --filter @news/shared test
```

期望输出：`detectLangSimple is not a function`。

- [ ] **Step 7：实现 `src/lang.ts`** + `src/index.ts`

```ts
// src/lang.ts
export function detectLangSimple(text: string): "zh" | "en" {
  if (!text) return "en";
  const cjk = text.match(/[\u4e00-\u9fff]/g)?.length ?? 0;
  return cjk / text.length >= 0.3 ? "zh" : "en";
}
```

```ts
// src/index.ts
export * from "./env";
export * from "./tags";
export * from "./lang";
```

- [ ] **Step 8：跑测试确认 PASS**

```powershell
pnpm --filter @news/shared test
```

- [ ] **Step 9：提交**

```powershell
git add -A
git commit -m "feat(shared): env schema, controlled tags, language heuristic"
```

---

## Task 0.3: 建 `packages/db`（Drizzle schema + 客户端）

**Files:**
- Create: `packages/db/package.json`
- Create: `packages/db/tsconfig.json`
- Create: `packages/db/drizzle.config.ts`
- Create: `packages/db/src/schema.ts`
- Create: `packages/db/src/client.ts`
- Create: `packages/db/src/index.ts`

- [ ] **Step 1：`package.json`**

```json
{
  "name": "@news/db",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "scripts": {
    "generate": "drizzle-kit generate",
    "migrate": "tsx src/migrate.ts"
  },
  "dependencies": {
    "drizzle-orm": "^0.36.0",
    "postgres": "^3.4.4"
  },
  "devDependencies": {
    "drizzle-kit": "^0.28.0",
    "tsx": "^4.19.0"
  }
}
```

- [ ] **Step 2：`drizzle.config.ts`**

```ts
import { defineConfig } from "drizzle-kit";
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL! },
});
```

- [ ] **Step 3：实现 `src/schema.ts`**（与 spec §5 一致；首版含 `sources / items / item_enrichments / clusters / user_links / keyword_rules`）

> 完整代码见仓库 PR；要点：
> - `items` 唯一索引 `(source_id, external_id)`；
> - `item_enrichments.embedding` 用 `customType` 映射 `vector(1024)`；
> - 所有时间列默认 `now()`。

- [ ] **Step 4：实现 `src/client.ts`**

```ts
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";
const sql = postgres(process.env.DATABASE_URL!, { max: 10 });
export const db = drizzle(sql, { schema });
```

- [ ] **Step 5：`src/migrate.ts`** —— 启动时跑 `migrate(db, { migrationsFolder: './drizzle' })`。

- [ ] **Step 6：先安装并生成空迁移占位**

```powershell
pnpm install
pnpm --filter @news/db generate
```

期望：`packages/db/drizzle/` 出现 `0000_*.sql`。

- [ ] **Step 7：补 SQL：在迁移开头加 `CREATE EXTENSION IF NOT EXISTS vector;`**

- [ ] **Step 8：提交**

```powershell
git add -A
git commit -m "feat(db): drizzle schema, pgvector extension, initial migration"
```

---

## Task 0.4: Docker Compose 与本地起栈

**Files:**
- Create: `docker/compose.yaml`
- Create: `docker/web.Dockerfile`（占位，M0 末再用）
- Create: `docker/worker.Dockerfile`（占位）

- [ ] **Step 1：`compose.yaml`**

```yaml
services:
  postgres:
    image: pgvector/pgvector:pg16
    environment:
      POSTGRES_USER: news
      POSTGRES_PASSWORD: news
      POSTGRES_DB: news
    ports: ["5432:5432"]
    volumes: ["./.data/pg:/var/lib/postgresql/data"]
  redis:
    image: redis:7
    ports: ["6379:6379"]
    volumes: ["./.data/redis:/data"]
  rsshub:
    image: diygod/rsshub:latest
    ports: ["1200:1200"]
    environment:
      NODE_ENV: production
```

- [ ] **Step 2：起依赖容器**

```powershell
cd docker
docker compose up -d postgres redis rsshub
docker compose ps
```

期望：3 个容器都是 `running`。

- [ ] **Step 3：本机临时设环境变量并跑迁移**

```powershell
$env:DATABASE_URL="postgres://news:news@localhost:5432/news"
pnpm --filter @news/db exec tsx src/migrate.ts
```

期望：无错误；`psql` 连进去能看到 7 张表与 `vector` 扩展。

- [ ] **Step 4：提交**

```powershell
git add -A
git commit -m "chore(docker): postgres/redis/rsshub compose; run initial migration"
```

---

## Task 0.5: 建 `apps/web`（Next.js + NextAuth 凭据登录 + 空大屏）

**Files:**
- Create: `apps/web/package.json`
- Create: `apps/web/next.config.ts`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/middleware.ts`
- Create: `apps/web/lib/auth.ts`
- Create: `apps/web/app/(auth)/login/page.tsx`
- Create: `apps/web/app/api/auth/[...nextauth]/route.ts`
- Create: `apps/web/app/(dash)/layout.tsx`
- Create: `apps/web/app/(dash)/page.tsx`

- [ ] **Step 1：`package.json`**

```json
{
  "name": "@news/web",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "next dev -p 3000",
    "build": "next build",
    "start": "next start -p 3000"
  },
  "dependencies": {
    "next": "^15.0.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "next-auth": "^4.24.0",
    "bcryptjs": "^2.4.3",
    "@news/shared": "workspace:*",
    "@news/db": "workspace:*"
  },
  "devDependencies": { "@types/bcryptjs": "^2.4.6" }
}
```

- [ ] **Step 2：`lib/auth.ts`** —— NextAuth 单账号 Credentials Provider，校验 `AUTH_USER` + bcrypt(`AUTH_PASS_HASH`)。

- [ ] **Step 3：`middleware.ts`** —— 除 `/api/auth/*` 与 `/login` 外全部要求登录。

- [ ] **Step 4：`(auth)/login/page.tsx`** —— 简单表单 → `signIn('credentials', ...)`.

- [ ] **Step 5：`(dash)/layout.tsx`** —— 左侧导航（精选 / 信源 / 信源健康 / 关键词 / 系统）。

- [ ] **Step 6：`(dash)/page.tsx`** —— 一个空时间轴 + 「暂无内容」占位。

- [ ] **Step 7：生成密码哈希工具脚本** `apps/web/scripts/hash-password.mjs`

```js
import bcrypt from "bcryptjs";
const pw = process.argv[2];
console.log(bcrypt.hashSync(pw, 10));
```

- [ ] **Step 8：本地运行**

```powershell
cp .env.example .env
# 用脚本生成 hash，填回 .env: AUTH_USER=admin / AUTH_PASS_HASH=...
pnpm --filter @news/web dev
```

打开 `http://localhost:3000`，能登录、能进空大屏。

- [ ] **Step 9：提交**

```powershell
git add -A
git commit -m "feat(web): nextauth credential login, dash skeleton"
```

---

## Task 0.6: M0 收尾 —— Web Dockerfile + Compose 接入 web

**Files:**
- Modify: `docker/web.Dockerfile`
- Modify: `docker/compose.yaml`（追加 `web` 服务）

- [ ] **Step 1：`web.Dockerfile`**（multi-stage：pnpm install → next build → next start）

- [ ] **Step 2：compose 加 `web` 服务**：依赖 `postgres / redis`，挂 `.env`，端口 `3000`。

- [ ] **Step 3：构建并起栈**

```powershell
docker compose up -d --build web
docker compose logs -f web
```

打开 `http://localhost:3000` 能登录 ✅

- [ ] **Step 4：提交并打 tag**

```powershell
git add -A
git commit -m "build(web): dockerfile + compose service; M0 done"
git tag m0
```

---

# M1 — RSS + Hacker News connector + 时间轴 + SSE

> **完成态**：能在 UI 创建一个 RSS 源 / 一个 HN 源；worker 5 分钟内拉到内容写入 DB；大屏 SSE 实时上屏。

## Task 1.1: `packages/connectors/core` —— 接口与归一化结构

**Files:**
- Create: `packages/connectors/core/package.json`
- Create: `packages/connectors/core/src/types.ts`
- Create: `packages/connectors/core/src/registry.ts`
- Create: `packages/connectors/core/src/index.ts`

- [ ] **Step 1：`types.ts`**

```ts
export type ConnectorKind = "rss" | "hn" | "x-rsshub";
export interface FetchContext {
  source: { id: string; config: unknown; lastOkAt?: Date | null };
  now: Date;
  signal: AbortSignal;
}
export interface NormalizedItem {
  externalId: string;
  url?: string;
  author?: string;
  title?: string;
  contentText?: string;
  media?: Array<{ type: "image" | "video"; url: string; thumb?: string }>;
  publishedAt?: Date;
  raw: unknown;
}
export interface Connector {
  kind: ConnectorKind;
  validateConfig(c: unknown): Promise<void>;
  fetch(ctx: FetchContext): Promise<NormalizedItem[]>;
}
```

- [ ] **Step 2：`registry.ts`**

```ts
import type { Connector, ConnectorKind } from "./types";
const reg = new Map<ConnectorKind, Connector>();
export const register = (c: Connector) => reg.set(c.kind, c);
export const getConnector = (k: ConnectorKind) => {
  const c = reg.get(k);
  if (!c) throw new Error(`No connector for kind=${k}`);
  return c;
};
```

- [ ] **Step 3：提交**

```powershell
git add -A
git commit -m "feat(connectors/core): types and registry"
```

---

## Task 1.2: HN connector（先做 HN，因为它最稳，可作为 connector 模板）

**Files:**
- Create: `packages/connectors/hn/package.json`
- Create: `packages/connectors/hn/src/index.ts`
- Create: `packages/connectors/hn/tests/hn.test.ts`

- [ ] **Step 1：写失败测试**（用 `vi.spyOn(global, "fetch")` mock Algolia 响应；断言 `externalId === objectID` 与 `publishedAt` 解析正确）。

- [ ] **Step 2：跑 → FAIL**

```powershell
pnpm --filter @news/connectors-hn test
```

- [ ] **Step 3：实现：调用 `https://hn.algolia.com/api/v1/search_by_date?tags=story` + 可选 `query=`/`numericFilters=points>=N`；用 `lastOkAt` 转成 `numericFilters=created_at_i>...`；map 成 `NormalizedItem`。

- [ ] **Step 4：跑 → PASS**

- [ ] **Step 5：提交**

```powershell
git commit -am "feat(connectors): hacker news via algolia"
```

---

## Task 1.3: RSS connector

**Files:**
- Create: `packages/connectors/rss/package.json` (deps: `rss-parser`)
- Create: `packages/connectors/rss/src/index.ts`
- Create: `packages/connectors/rss/tests/rss.test.ts`

- [ ] **Step 1：写失败测试** —— 用本地 fixture `tests/fixtures/sample-feed.xml`，断言 `externalId` 优先 `guid`，缺失退化为 `link` 哈希；`publishedAt` 来自 `pubDate`/`isoDate`。

- [ ] **Step 2：跑 → FAIL** → 实现 → **PASS**。

- [ ] **Step 3：提交**

```powershell
git commit -am "feat(connectors): rss/atom via rss-parser"
```

---

## Task 1.4: Worker 骨架 + Source CRUD API + repeat job 同步

**Files:**
- Create: `apps/worker/package.json` (deps: `bullmq`, `ioredis`, `@news/db`, 三个 connectors)
- Create: `apps/worker/src/index.ts`
- Create: `apps/worker/src/scheduler.ts`
- Create: `apps/worker/src/jobs/fetch-source.ts`
- Create: `apps/worker/src/ipc/publish.ts`
- Create: `apps/web/app/api/sources/route.ts`
- Create: `apps/web/app/api/sources/[id]/route.ts`
- Create: `apps/web/app/(dash)/sources/page.tsx`

- [ ] **Step 1：DB 增 helper**：`@news/db` 导出 `listSources / upsertSource / deleteSource / recordItems / markSourceRun`。

- [ ] **Step 2：API Routes** —— `GET/POST /api/sources`，`PATCH/DELETE /api/sources/:id`；写入后向 Redis Pub/Sub `sources.changed` 发消息（payload: `{op, id}`）。

- [ ] **Step 3：UI 信源页** —— 列表 + 「新增」对话框（kind 切换：rss / hn / x-rsshub 表单）。

- [ ] **Step 4：worker scheduler** —— 启动时 `listSources()` → 把每个 enabled 源注册成 `bullmq` repeat job (`every: fetch_interval_sec * 1000`)；同时订阅 `sources.changed`，按 op 增删 repeat job。

- [ ] **Step 5：`jobs/fetch-source.ts`** —— `getConnector(kind).fetch(ctx)` → `recordItems()` → `markSourceRun(ok)`；失败：写 `last_error` + `fail_count++` + 退避（修改 `fetch_interval_sec` 临时不可，改为下一次 `delay`）。

- [ ] **Step 6：本地联调** ——
  1. `docker compose up -d postgres redis rsshub web`；
  2. `pnpm --filter @news/worker dev`；
  3. UI 加一个 RSS 源（如 `https://news.ycombinator.com/rss`）；
  4. 1–2 分钟内 worker 日志显示 `fetched N items`，DB `items` 表有数据。

- [ ] **Step 7：提交**

```powershell
git commit -am "feat(worker): scheduler + fetch-source job; web: source CRUD UI"
```

---

## Task 1.5: 时间轴查询 + SSE

**Files:**
- Create: `apps/web/app/api/items/route.ts`（分页 + 过滤）
- Create: `apps/web/app/api/stream/route.ts`（SSE）
- Create: `apps/web/lib/sse-bus.ts`（Redis Pub/Sub → SSE 写出）
- Modify: `apps/web/app/(dash)/page.tsx`（首屏拉历史 + 订阅 SSE 合并）
- Modify: `apps/worker/src/jobs/fetch-source.ts`（写完后 `publish('news.events', {type:'item.created', ...})`）

- [ ] **Step 1：实现 `/api/items`**：`?platform=&tag=&q=&before=&limit=` 倒序返回。

- [ ] **Step 2：实现 SSE Route** —— 创建 `ReadableStream`，订阅 Redis 频道；客户端断开时取消订阅。

- [ ] **Step 3：worker 写入后发 publish**。

- [ ] **Step 4：UI 大屏组件** —— 首屏 `fetch /api/items?limit=50`；建立 EventSource，新事件 prepend，并加 1.5s 高亮 CSS。

- [ ] **Step 5：手测** —— 添加一个高频 RSS（如 `https://hnrss.org/newest`），打开大屏；新条目应在抓到后秒级出现。

- [ ] **Step 6：提交并打 tag**

```powershell
git commit -am "feat: items API, SSE stream, dashboard live timeline; M1 done"
git tag m1
```

---

# M2 — X via RSSHub

## Task 2.1: x-rsshub connector

**Files:**
- Create: `packages/connectors/x-rsshub/package.json`
- Create: `packages/connectors/x-rsshub/src/index.ts`

- [ ] 复用 `rss` 实现：`config = { handle: string }`，URL 拼成 `${RSSHUB_BASE}/twitter/user/${handle}`；归一化时把 `dc:creator` 当 author。
- [ ] 在 `apps/worker/src/index.ts` 注册 connector。
- [ ] UI 信源新增表单加 `x-rsshub` 分支（输入 handle）。
- [ ] 手测：加一个公开账号（如 `OpenAI`），等下一周期能看到推文。
- [ ] 提交并打 tag `m2`。

> **如果 RSSHub 频繁失败**：在 `last_error` 上观察，记录到风险日志；M5 健康面板会自动暴露这种问题。

---

# M3 — 翻译 + 标签（AI 流水线第 1 步）

## Task 3.1: `packages/ai` LLM 客户端

**Files:**
- Create: `packages/ai/package.json` (deps: `openai`)
- Create: `packages/ai/src/llm-client.ts`
- Create: `packages/ai/src/translate-tag.ts`
- Create: `packages/ai/tests/translate-tag.test.ts`

- [ ] **Step 1：`llm-client.ts`** —— 用 `openai` SDK 但 `baseURL = LLM_BASE_URL`、`apiKey = LLM_API_KEY`，导出 `chat()` 与 `embed()`。
- [ ] **Step 2：写失败测试**（mock chat 返回固定 JSON，断言解析后是 `{lang, title_zh, tags[]}`，且 tags 全部在受控词表内）。
- [ ] **Step 3：实现 `translate-tag.ts`**：构造 prompt，包含受控标签词表与「最多 1–2 自由标签」约束；强制 `response_format: { type: 'json_object' }`；用 zod 校验返回。
- [ ] **Step 4：通过测试 → 提交**：`feat(ai): translate+tag pipeline step`

## Task 3.2: enrich job + 触发

**Files:**
- Create: `apps/worker/src/jobs/enrich-item.ts`
- Modify: `apps/worker/src/jobs/fetch-source.ts`（新条目入 `enrich` 队列）
- Modify: `apps/web/app/api/items/route.ts`（join `item_enrichments`）
- Modify: 大屏卡片组件：标题中文优先；展示 tags chips
- Modify: SSE 事件加 `item.enriched`

- [ ] enrich 并发上限 4；失败重试 3 次。
- [ ] 手测：添加一个英文 RSS（如 `https://www.anthropic.com/news/rss.xml`）；新条目 30 秒内显示中文标题与若干标签。
- [ ] 提交并打 `m3`。

---

# M4 — 聚类（事件归并）

## Task 4.1: embeddings + pgvector 查询

**Files:**
- Modify: `packages/ai/src/embeddings.ts`
- Modify: `apps/worker/src/jobs/enrich-item.ts`（追加 embedding + cluster 步骤）
- Create: `apps/worker/src/pipeline/cluster.ts`
- Create: `apps/worker/src/jobs/name-cluster.ts`
- Modify: `packages/db/src/schema.ts` 已含 `clusters` 表 / `embedding`；这里只补 SQL 索引：`ivfflat` + `lists=100`

- [ ] **Step 1：`embed()` 走 OpenAI 兼容 `embeddings`**；维度对齐 `vector(1024)`（用 `text-embedding-3-small` 截断或选合适模型）。
- [ ] **Step 2：`pipeline/cluster.ts`**：
  ```sql
  SELECT cluster_id, 1 - (embedding <=> $1) AS sim
  FROM item_enrichments
  WHERE cluster_id IS NOT NULL
    AND enriched_at > now() - interval '72 hours'
  ORDER BY embedding <=> $1 ASC
  LIMIT 1;
  ```
  阈值默认 0.86：>= 阈值 → 复用；否则新建 cluster 并入 `name-cluster` 队列。
- [ ] **Step 3：`name-cluster.ts`** —— 拿 cluster 里最近 5 条标题让 LLM 起一个 ≤ 16 字的 topic。
- [ ] **Step 4：UI 卡片** —— 显示「另有 N 个源也报道了此事件」（join `clusters.item_count - 1`）。
- [ ] **Step 5：手测** —— 找一个被多家媒体同时报道的事件（如最近一次 OpenAI 公告），观察是否聚到同一 cluster。
- [ ] 提交并打 `m4`。

---

# M5 — 信源健康面板 + 关键词桌面通知

## Task 5.1: 健康面板

**Files:**
- Create: `apps/web/app/api/health/route.ts`
- Create: `apps/web/app/(dash)/health/page.tsx`

- [ ] 表格：name / kind / lastOkAt / lastError / failCount / next run countdown / 24h 成功率（按抓取日志聚合；首版可只展示前 5 列，24h 成功率留 TODO）。
- [ ] 「立即抓一次」按钮 → `POST /api/sources/:id/run` → worker 入一次性 job。
- [ ] 提交。

## Task 5.2: 关键词规则 + 桌面通知

**Files:**
- Create: `apps/web/app/api/keywords/route.ts`
- Create: `apps/web/app/(dash)/keywords/page.tsx`
- Modify: 大屏组件：订阅 keywords，命中时 `new Notification(...)`；首次访问请求权限。

- [ ] CRUD `keyword_rules`（pattern、is_regex、notify）。
- [ ] 客户端过滤逻辑：item.title + content_text + title_zh 任一命中即通知。
- [ ] 手测：加一个常见词（如 `Claude`），新条目命中即弹窗。
- [ ] 提交并打 `m5`。

---

# M6 — 数据保留、备份、文档

## Task 6.1: 数据清理 + 备份

**Files:**
- Create: `apps/worker/src/jobs/retention.ts`
- Create: `docker/cron-pgdump.sh`
- Modify: `docker/compose.yaml`（加 `cron`/或 `worker` 内 BullMQ daily job）

- [ ] retention：每日 03:00 删除 `items.published_at < now() - interval '90 days'`（级联 enrichment）；删除孤立 cluster。
- [ ] 备份：每日 02:00 `pg_dump` 到 `./backups/news-YYYYMMDD.sql.gz`，保留 14 份。
- [ ] 提交。

## Task 6.2: README + .env.example 完整化

**Files:**
- Modify: `README.md`
- Modify: `.env.example`

- [ ] README 章节：先决条件、`docker compose up -d`、首次密码 hash 步骤、添加第一个 RSS / X 账号、常见问题（RSSHub 不稳怎么办、LLM 配额耗尽怎么关 enrich）。
- [ ] 提交并打 `m6`。

---

## 完成验收（整体）

- 全新机器：`git clone` → 填 `.env` → `docker compose up -d` → 30 分钟内能登录大屏。
- 添加 1 个 RSS、1 个 HN、1 个 X handle 后：
  - 5–10 分钟内时间轴出现新条目；
  - 非中文条目带中文标题与 tag chips；
  - 多源同事件出现「另有 N 个源」提示；
  - 关键词命中能弹桌面通知；
  - 信源健康面板可见每个源的状态。

---

## 后续（不在本计划内，但接口已预留）

- 公众号 / 小红书 / 抖音 / B 站 connector：在 `packages/connectors/<kind>` 新增并 `register()`。
- 多用户：`sources / items / user_links / keyword_rules` 加 `owner_id` 列与索引。
- 移动端 / Web Push / 邮件 / Telegram bot 通知：在 SSE 事件层加 sink。
