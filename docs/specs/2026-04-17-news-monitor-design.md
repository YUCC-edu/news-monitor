# news-monitor 设计文档

- **创建日期**：2026-04-17
- **文档作者**：项目方与 AI 协作
- **状态**：Living doc（与实现同步演进；**里程碑与交付事实**以 [`docs/STATUS.md`](../STATUS.md) 为准；**与代码不一致处**见 [`docs/DESIGN-DELTA.md`](../DESIGN-DELTA.md)）
- **目标**：复刻「AI HOT」类资讯监控大屏的核心能力，第一版聚焦自用单机部署。

---

## 1. 目标与非目标

### 1.1 目标
- 监控多个信源的新内容，5–10 分钟内出现在大屏上。
- 第一版支持平台：**RSS / Atom**、**Hacker News**、**X (Twitter，经自建 RSSHub)**、**公众号（经自建 WeWe-RSS，Atom 订阅）**（实现见 README「订阅公众号」与 `creators` 运营页）。
- 用户可在 UI 中：
  - 添加 / 启停 / 删除 信源；
  - 添加 X 账号（按 handle）；
  - 收藏一次性的链接（不一定能自动监控）。
- AI 二次加工：**翻译（非中文 → 中文）、自动打标签、事件聚类**。
- 大屏功能：时间轴流、信源健康面板、统计仪表、关键词命中桌面通知。

### 1.2 非目标（第一版不做）
- 多用户 / 多租户 / RBAC（自用，单账号即可）。
- **微信订阅号/服务号的官方开放平台接入**、以及 **小红书 / 抖音 / B 站** 等平台的原生 connector（后续若做再单独立项）。
- **说明**：第一版已通过 **WeWe-RSS** 将公众号内容转为 **Atom**，由现有 RSS 流水线抓取（`wechat-wewe` 信源种类），不属于上一条「官方平台 connector」。
- AI 摘要、热度评分（已与用户确认本期不做）。
- 移动端原生 App（响应式 Web 即可）。
- 计费 / 公开访问。

---

## 2. 关键设计决策（已确认）

| 项 | 选定 | 原因 |
|---|---|---|
| 部署形态 | 单机 + Docker Compose | 自用，最低运维成本 |
| 进程拆分 | **web**（Next.js）+ **worker**（独立 Node 进程） | 抓取/AI 不阻塞 UI，连接器独立演进 |
| 数据库 | PostgreSQL + pgvector | JSONB 存原始 payload；向量做聚类，免引入 ES/Milvus |
| 队列 / 实时通道 | Redis（BullMQ + Pub/Sub） | 同时承担调度与 SSE 跨进程广播 |
| 前端 | Next.js App Router + **轻量图表（CSS）**；**ECharts 为可选增强**（当前仓库统计页未引入 `echarts`，见 `DESIGN-DELTA`） | 自用够用，避免过早绑定可视化栈 |
| X 接入 | **自建 RSSHub** 容器 | 无须官方付费 API，统一作为 RSS 源处理 |
| LLM 接入 | **OpenAI 兼容协议**（默认） | 一份代码兼容 OpenAI / DeepSeek / 通义千问等 |
| 通知 | Web Notifications API（关键词命中） | 无需额外推送服务 |
| 受众 | 单用户自用 | 加 Basic Auth / NextAuth 凭据登录防裸奔 |

---

## 3. 系统架构

```
┌─────────────────────────────────────────────────────────────┐
│                       Browser（大屏 UI）                     │
│      Next.js App Router + SSE 实时推送 + 统计/轻量图表        │
└──────────────▲──────────────────────────────▲───────────────┘
               │ HTTP/SSE                    │ HTTP
┌──────────────┴───────────┐        ┌────────┴────────────────┐
│  Next.js API Routes      │        │  Worker（独立 Node 进程）│
│  - 信源 CRUD             │        │  - BullMQ 调度（cron）   │
│  - items 查询/筛选       │        │  - Connector 执行抓取    │
│  - SSE 推送通道           │◄──────►│  - AI 流水线（标签/译/聚类）│
└──────────┬───────────────┘  Redis │  - 写入 Postgres + 触发推送│
           │                pub/sub  └────────────┬────────────┘
           ▼                                      ▼
       ┌──────────────────────────────────────────────┐
       │      Postgres（主数据 + JSONB + pgvector）   │
       └──────────────────────────────────────────────┘

         ┌────────────┐
         │  RSSHub    │  ← 自建容器，把 X / 其它平台转成 RSS
         └────────────┘
```

### 3.1 容器清单（docker-compose）
| 服务 | 镜像 | 说明 |
|---|---|---|
| `web` | 项目自建（Node 22） | Next.js (App Router)，对外暴露 3000 |
| `worker` | 项目自建（Node 22） | BullMQ 调度 + connector + AI 流水线 |
| `postgres` | `pgvector/pgvector:pg16` | 内置 pgvector |
| `redis` | `redis:7` | 队列 + Pub/Sub |
| `rsshub` | `diygod/rsshub:latest` | X 转 RSS（自用） |

> 默认 5 容器都跑在本机。`web` 与 `worker` 通过共享代码包构建，但运行时分进程。

---

## 4. 模块边界与代码结构

monorepo（pnpm workspace）：

```
news-monitor/
├── apps/
│   ├── web/                  # Next.js（UI + API Routes + SSE）
│   └── worker/               # BullMQ 调度 + Connector + AI 流水线
├── packages/
│   ├── db/                   # Drizzle schema + 迁移 + 客户端
│   ├── connectors/           # 各平台 connector 接口与实现
│   │   ├── core/             # 接口、归一化结果、错误类型
│   │   ├── rss/
│   │   ├── hn/
│   │   └── x-rsshub/
│   ├── ai/                   # OpenAI 兼容客户端 + 流水线步骤
│   └── shared/               # 通用类型、常量、受控标签词表
├── docker/                   # Dockerfile + compose
├── docs/specs/               # 本文档所在目录
└── .env.example
```

每个 connector **必须** 实现统一接口：

```ts
export interface Connector {
  kind: 'rss' | 'hn' | 'x-rsshub';
  validateConfig(config: unknown): Promise<void>;
  fetch(ctx: FetchContext): Promise<NormalizedItem[]>;
}
```

`NormalizedItem` 为后文 §5.2 表 `items` 的应用层类型。

---

## 5. 数据模型

### 5.1 表清单

```text
sources              -- 信源配置
item_enrichments     -- AI 二次加工
items                -- 归一化内容
clusters             -- 事件聚合
user_links           -- 手动收藏链接
keyword_rules        -- 关键词通知规则
controlled_tags      -- 受控标签词表（系统维护，可由用户编辑）
```

### 5.2 关键字段

```sql
-- sources
id                    uuid PK
kind                  text check (kind in ('rss','hn','x-rsshub'))
name                  text
config                jsonb            -- 各 connector 自定义
enabled               bool default true
fetch_interval_sec    int default 300  -- 5 min
last_run_at           timestamptz
last_ok_at            timestamptz
last_error            text
fail_count            int default 0
created_at            timestamptz default now()

-- items
id                    uuid PK
source_id             uuid FK -> sources(id) on delete cascade
external_id           text not null
url                   text
author                text
title                 text
content_text          text
media                 jsonb            -- [{type, url, thumb}]
published_at          timestamptz
fetched_at            timestamptz default now()
raw                   jsonb
unique (source_id, external_id)

-- item_enrichments
item_id               uuid PK FK -> items(id) on delete cascade
lang                  text             -- 检测到的源语言
title_zh              text
content_zh            text
tags                  text[]
embedding             vector(1024)     -- pgvector
cluster_id            uuid FK -> clusters(id) on delete set null
enriched_at           timestamptz

-- clusters
id                    uuid PK
topic                 text             -- AI 命名
first_seen_at         timestamptz
last_seen_at          timestamptz
item_count            int default 0

-- user_links
id                    uuid PK
url                   text
note                  text
created_at            timestamptz default now()

-- keyword_rules
id                    uuid PK
pattern               text             -- 关键词或正则
is_regex              bool default false
notify                bool default true
created_at            timestamptz

-- controlled_tags
tag                   text PK
display_zh            text
weight                int default 0
```

### 5.3 索引
- `items(source_id, published_at desc)`
- `items(fetched_at desc)`
- `items.title` GIN trigram（关键词检索；迁移 `0005_search_backoff.sql` 启用 `pg_trgm` + GIN）
- `item_enrichments.embedding` ivfflat（cosine，`lists` 默认 50，可按数据量在迁移中调参）
- `item_enrichments.tags` GIN
- `sources.next_run_after`：抓取失败退避的下次可执行时间（与 BullMQ `every` 并存；作业开头若未到点则直接跳过）

---

## 6. 抓取调度

### 6.1 调度策略
- worker 启动时：把所有 `enabled=true` 的 source 注册成 BullMQ **repeat job**，间隔 `fetch_interval_sec`。
- 同一 source **串行**（不重叠抓取）；不同 source 并行，整体并发上限默认 8（可调）。
- 信源 CRUD 后通过 Redis Pub/Sub 通知 worker 增删 repeat job。

### 6.2 失败策略
- 单次抓取失败：异常入 `last_error`，`fail_count++`。
- 退避：连续失败时把 **本源**的下次执行推迟到 `min(2^fail_count * 60s, 2h)`（写入 `sources.next_run_after`；BullMQ repeat `every` 仍按间隔触发，作业开头若未到点则跳过，不与 `upsertJobScheduler` 的 `every` 互斥覆盖）。
- `fail_count >= 10` 自动 `enabled=false`，worker 移除该源的 repeat scheduler，并 `PUBLISH sources.changed` 同步；SSE 发 `source.health`。

### 6.3 去重
- DB 唯一索引 `(source_id, external_id)`。
- 写入用 `INSERT ... ON CONFLICT DO NOTHING`，**仅新增的行**进入：
  1. AI enrich 队列
  2. SSE 实时广播
  3. 关键词通知队列

---

## 7. AI 流水线

### 7.1 触发与排队
- 新增 item 入 `enrich` 队列；并发上限默认 4（可调，控制 LLM 成本）。
- 每条 item 走 **三步合一** 的作业，失败可重试 3 次（指数退避）。

### 7.2 步骤
1. **语言检测**：用轻量本地启发式（CJK 比例）+ 必要时调用 LLM；中文直接跳过翻译。
2. **翻译 + 标签（合并一次 LLM 调用）**：
   - 输入：`{ title, content_text[:600] }` + 受控标签词表。
   - 输出 JSON：`{ lang, title_zh?, content_zh?, tags: string[] }`。
   - **强约束**：`tags` 必须先从受控词表选；最多再追加 1–2 个新标签（出现 3 次以上才进入受控表，由后台脚本周期审计）。
3. **Embedding + 聚类**：
   - 用 OpenAI 兼容 `embeddings` 接口；模型可配置（默认 `text-embedding-3-small` 等价物）。
   - 在最近 **72 小时** 内查 `cosine_similarity > 0.86` 的条目：
     - 命中 → 加入对应 cluster，`item_count++`，`last_seen_at = now()`。
     - 未命中 → 新建 cluster，并对最近 N（默认 5）条标题再做一次 LLM 调用生成 `topic`。

### 7.3 LLM 客户端
- 统一封装 `chat.completions` + `embeddings` 两个接口。
- 通过 `.env` 切换 provider：

```
LLM_BASE_URL=https://api.openai.com/v1
LLM_API_KEY=sk-...
LLM_CHAT_MODEL=gpt-4o-mini
LLM_EMBEDDING_MODEL=text-embedding-3-small
```

兼容 DeepSeek / 通义千问 OpenAI 兼容端点（仅改三个变量）。

### 7.4 失败兜底
- AI 流水线失败 **不阻塞**展示：item 已写入即可在大屏出现，仅缺标签 / 翻译 / 所属事件。
- 提供「重新 enrich」管理操作（按 source / 时间窗 / 单条三种粒度）：**产品入口**为 Web **`/ops` 运维页** + `POST /api/ops/re-enrich`（有单次条数上限）；脚本 `scripts/retry-enrich-failed.ts` 等仍可用于队列失败重试。

---

## 8. 实时推送（SSE + 通知）

### 8.1 SSE 通道
- 路径：`GET /api/stream`
- 事件类型：
  - `item.created`（新条目；带最小展示字段）
  - `item.enriched`（带 tags / 翻译 / cluster_id；前端就地合并）
  - `source.health`（信源状态变更）
  - `cluster.updated`（cluster 增长）

### 8.2 跨进程通知
- worker 写入后发 Redis Pub/Sub 频道 `news.events`；
- web 侧每个 SSE 连接订阅频道并按客户端订阅过滤后下发。

### 8.3 桌面通知
- 大屏首次加载时弹出「请允许通知权限」。
- 客户端订阅 `keyword_rules`，新条目命中规则即调用 `Notification` API；服务端不直接推系统通知。

---

## 9. UI / UX

### 9.1 导航（左侧固定）
- 精选（默认时间轴）
- 全部 AI 动态
- 收藏
- 信源（管理）
- 信源健康
- 统计
- 关键词与通知
- 系统（环境信息、日志、AI Key 状态）

### 9.2 时间轴卡片
- 顶部：平台徽标 + 作者 + 时间。
- 标题（中文优先；下方折叠原文）。
- 媒体缩略；可点击放大。
- 底部：标签 chips、所属 cluster 提示「另有 N 个源也报道了此事件」。
- 操作：收藏、屏蔽该作者、屏蔽该 cluster。

### 9.3 过滤器
- 平台多选 / 标签多选 / 关键词输入 / 时间窗（24h、7d、30d、自定义）。
- 全部条件以 URL search params 持久化。

### 9.4 信源管理
- 列表：名称、类型、间隔、最近成功、失败次数、操作。
- 新建：选 `kind` → 动态展示 config 表单：
  - `rss`：feed_url（探测有效性）
  - `hn`：query / points_min
  - `x-rsshub`：handle（拼成 `RSSHUB_BASE/twitter/user/<handle>`）
- 「添加链接」流程：
  1. 粘贴 URL；
  2. 自动探测 `<link rel="alternate" type="application/rss+xml">`；
  3. 有 RSS 则提示创建 source；无则写入 `user_links` 收藏。

### 9.5 信源健康
- 表格：上次成功 / 上次错误信息 / 连续失败 / 24h 成功率 / 下次抓取倒计时。
- 一键「立即抓一次」按钮（仅手动）。

### 9.6 统计
- 今日新增（按平台堆叠柱状图）
- 标签 TopN（条形图）
- 活跃 cluster TopN（按 24h `item_count`）
- 统计页提供 **导出当前概览为 CSV**（与 §2「轻量 CSS 图」一致；若未来引入 ECharts 属可选增强）

---

## 10. 安全与配置

### 10.1 鉴权
- NextAuth Credentials Provider 单账号；用户名 / 密码哈希存 `.env`（`AUTH_USER`, `AUTH_PASS_HASH`）。
- 中间件保护除 `/api/auth/*` 之外的全部路由。

### 10.2 密钥
- 所有第三方 key 走 `.env`，不入库。
- UI 仅显示「已配置 / 未配置 / 最近调用是否成功」。

### 10.3 抓取礼仪
- 默认 UA：`news-monitor/<version> (+self-host)`。
- 单源最小间隔 60s；不允许 UI 设置低于此值。
- 遵守目标站 `robots.txt`（针对网页类 connector；后续接公众号/网站时启用）。

---

## 11. 数据保留与运维

- 默认保留 **90 天**：定时任务每日 03:00 删除 `items.published_at < now() - 90d` 及级联的 enrichment。
- 备份：`postgres` volume 每日 02:00 通过 `pg_dump` 输出到 `./backups/`，保留 14 份。
- 日志：`web` / `worker` stdout，docker logs 即可；无需外部 ELK。

---

## 12. 里程碑

| 里程碑 | 范围 | 验收标准 |
|---|---|---|
| **M0 脚手架** | monorepo、compose、DB 迁移、登录 | `docker compose up` 后能登录并看到空大屏 |
| **M1 RSS + HN** | 两个 connector + 时间轴 + SSE | 添加任一 RSS / HN 源 5 分钟内有新条目上屏 |
| **M2 X via RSSHub** | RSSHub 容器 + connector | 添加 X handle 能正常获取最近若干条 |
| **M3 翻译 + 标签** | LLM 客户端 + 流水线步骤 1–2 | 非中文条目入库后 30s 内出现 `title_zh` 与 tags |
| **M4 聚类** | embedding + pgvector + 主题命名 | 同一事件多源条目聚到同一 cluster，UI 显示「另有 N 个源」 |
| **M5 健康面板 + 关键词通知** | 健康表格 + Web Notifications | 命中关键词时浏览器收到桌面通知 |
| **M6 运维收尾** | 数据清理、备份脚本、README、`.env.example` | 全新机器照 README 30 分钟内启动成功 |

---

## 13. 风险与对策

| 风险 | 对策 |
|---|---|
| **RSSHub 经常失效（X 风控）** | connector 内独立健康度统计；UI 高亮；保留切换到官方 API 的接口位 |
| **LLM 成本失控** | enrich 并发上限 + 翻译只取前 600 字 + 标签强约束 + 失败不重抓全文 |
| **聚类阈值不准** | 阈值（默认 0.86）写入 `system_settings`，UI 可调；提供「拆分 / 合并 cluster」管理操作（M5+ 视情况追加） |
| **本机断电 / 容器崩溃** | repeat job + 唯一索引天然幂等；启动时 worker 自检并补齐 repeat job |
| **`Program Files` 路径误用** | 项目固定在 `C:\Users\yccva\dev\news-monitor`，与 `campusmart` 工作区隔离 |

---

## 14. 暂不实现但需预留接口的能力

- 多 connector：在 `packages/connectors` 下新增目录即可，`Connector` 接口稳定。
- 多用户：`sources / items / user_links / keyword_rules` 已可加 `owner_id` 列，本期不加但表设计兼容。
- 移动端 / 推送服务：SSE 已经抽象出事件层，将来接 Web Push / 邮件只是新增 sink。
