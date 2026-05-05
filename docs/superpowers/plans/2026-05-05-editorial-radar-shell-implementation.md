# Editorial Radar Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Web dashboard into a low-density Editorial Radar product shell with Today / Read / Briefs / Sources / Settings, a focused Today page, and a Main Signal drawer.

**Architecture:** Keep the existing backend APIs and routes. Add a pure data-selection layer that converts `/api/stats`, `/api/items`, and cluster sibling rows into the Editorial Radar view model, then replace the current dense home page with a compact product surface that consumes that model. Keep existing feature pages reachable through the new product information architecture and command palette.

**Tech Stack:** Next.js App Router, React client components, TypeScript, Node test runner through `tsx --test`, existing CSS primitives in `apps/web/app/globals.css`.

---

## File Structure

- Create `apps/web/lib/editorial-radar.ts`: Pure TypeScript view-model builder for Today and the Main Signal drawer.
- Create `apps/web/tests/editorial-radar.test.ts`: Unit tests for signal selection, reason generation, secondary signals, empty state, and representative source mapping.
- Modify `apps/web/lib/global-search.ts`: Define the product IA as reusable data and keep every existing route discoverable by command search.
- Modify `apps/web/tests/global-search.test.ts`: Verify the new IA exposes the five product sections and preserves legacy route access.
- Modify `apps/web/app/(dash)/layout.tsx`: Render the five product sections in the sidebar, use section-aware active state, and keep command search and appearance controls.
- Modify `apps/web/app/(dash)/page.tsx`: Replace the dense dashboard with the Today page and Main Signal drawer while reusing current API calls and live refresh behavior.
- Modify `apps/web/app/globals.css`: Add editorial layout classes, enforce black primary buttons with white text, define missing status tokens, and add responsive rules.

Do not touch these existing uncommitted files while executing this UI plan unless the user explicitly asks to finish that earlier work in the same commit: `apps/worker/src/scheduler.ts`, `apps/worker/tests/scheduler.test.ts`, `docs/PROJECT_OVERVIEW.md`.

---

### Task 1: Editorial Radar View Model

**Files:**
- Create: `apps/web/lib/editorial-radar.ts`
- Test: `apps/web/tests/editorial-radar.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/web/tests/editorial-radar.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import {
  mapRepresentativeSources,
  selectEditorialRadar,
  type EditorialOverview,
  type EditorialSiblingRow,
} from "../lib/editorial-radar";

function cluster(overrides: Partial<EditorialOverview["consensusClusters"][number]>) {
  return {
    id: "cluster-a",
    topic: "AI browser agents reshape publishing workflows",
    displayTitle: "AI browser agents reshape publishing workflows",
    itemCount: 12,
    lastSeenAt: "2026-05-05T09:00:00.000Z",
    distinctSources: 4,
    weightedDistinctSources: 3.6,
    sourceNames: "HN / The Verge / X / WeChat",
    itemsWindow: 12,
    recencyScore: 0.8,
    cohesionScore: 0.7,
    consensusScore: 0.9,
    breakingScore: 0.4,
    crossPlatformScore: 0.8,
    burstVelocity: 2.2,
    sourceQualityScore: 0.84,
    whyConsensus: ["4 个来源在同一窗口覆盖"],
    whyBreaking: ["2 小时内明显升温"],
    platforms: ["hn", "rss", "x-rsshub"],
    ...overrides,
  };
}

test("selectEditorialRadar chooses the strongest mixed signal and explains it", () => {
  const overview: EditorialOverview = {
    totals: { items_window: 91, active_sources_window: 8, clusters_window: 11 },
    consensusClusters: [
      cluster({ id: "consensus", consensusScore: 0.95, breakingScore: 0.2, distinctSources: 5 }),
    ],
    breakingClusters: [
      cluster({
        id: "breaking",
        topic: "Open model releases accelerate",
        displayTitle: "Open model releases accelerate",
        consensusScore: 0.5,
        breakingScore: 0.96,
        distinctSources: 3,
        burstVelocity: 3.4,
      }),
    ],
    hotspot: { consensusHotspotIndex: 77, breakingHotspotIndex: 88, attentionIndex: 72 },
  };

  const radar = selectEditorialRadar(overview, "24h");

  assert.equal(radar.isEmpty, false);
  assert.equal(radar.leadSignal?.id, "breaking");
  assert.equal(radar.secondarySignals.length, 1);
  assert.equal(radar.totalJudgment, "今天有 2 个信号值得注意");
  assert.equal(radar.leadSignal?.reasons.length, 3);
  assert.equal(radar.leadSignal?.reasons[0]?.label, "突发");
  assert.match(radar.leadSignal?.editorialTake ?? "", /正在升温/);
});

test("selectEditorialRadar deduplicates clusters that appear in consensus and breaking lists", () => {
  const same = cluster({ id: "same", consensusScore: 0.88, breakingScore: 0.92 });
  const overview: EditorialOverview = {
    totals: { items_window: 20, active_sources_window: 4, clusters_window: 2 },
    consensusClusters: [same],
    breakingClusters: [{ ...same, sourceNames: "HN / X" }],
    hotspot: {},
  };

  const radar = selectEditorialRadar(overview, "7d");

  assert.equal(radar.leadSignal?.id, "same");
  assert.equal(radar.secondarySignals.length, 0);
});

test("selectEditorialRadar returns a quiet empty state when no cluster exists", () => {
  const radar = selectEditorialRadar(
    {
      totals: { items_window: 0, active_sources_window: 0, clusters_window: 0 },
      consensusClusters: [],
      breakingClusters: [],
      hotspot: {},
    },
    "24h",
  );

  assert.equal(radar.isEmpty, true);
  assert.equal(radar.leadSignal, null);
  assert.equal(radar.totalJudgment, "今天还没有形成明确主信号");
});

test("mapRepresentativeSources keeps source names, titles, and links for the drawer", () => {
  const rows: EditorialSiblingRow[] = [
    {
      itemId: "item-1",
      title: "Original title",
      titleZh: "中文标题",
      url: "https://example.com/a",
      sourceId: "source-1",
      sourceName: "Example",
      platform: "rss",
      sourceConfig: null,
    },
  ];

  assert.deepEqual(mapRepresentativeSources(rows), [
    {
      id: "item-1",
      sourceName: "Example",
      platform: "rss",
      title: "中文标题",
      url: "https://example.com/a",
      sourceConfig: null,
    },
  ]);
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run:

```powershell
corepack pnpm --filter @news/web test -- editorial-radar.test.ts
```

Expected: FAIL because `apps/web/lib/editorial-radar.ts` does not exist.

- [ ] **Step 3: Implement the view-model builder**

Create `apps/web/lib/editorial-radar.ts`:

```ts
export type TimelineRange = "24h" | "72h" | "7d" | "30d";

export type EditorialCluster = {
  id: string;
  topic: string | null;
  displayTitle?: string;
  itemCount: number;
  lastSeenAt: string;
  distinctSources: number;
  weightedDistinctSources: number;
  sourceNames: string;
  itemsWindow: number;
  recencyScore: number;
  cohesionScore: number;
  consensusScore?: number;
  breakingScore?: number;
  crossPlatformScore: number;
  burstVelocity?: number;
  sourceQualityScore?: number;
  whyConsensus?: string[];
  whyBreaking?: string[];
  platforms?: string[];
};

export type EditorialOverview = {
  totals: {
    items_window: number;
    active_sources_window: number;
    clusters_window: number;
  };
  consensusClusters: EditorialCluster[];
  breakingClusters: EditorialCluster[];
  hotspot: {
    consensusHotspotIndex?: number;
    breakingHotspotIndex?: number;
    attentionIndex?: number;
  };
};

export type EditorialSignalReason = {
  label: "共识" | "突发" | "相关";
  value: string;
  detail: string;
};

export type EditorialSignal = {
  id: string;
  title: string;
  sourceNames: string;
  sourceCount: number;
  itemCount: number;
  lastSeenAt: string;
  score: number;
  editorialTake: string;
  reasons: EditorialSignalReason[];
  timeline: Array<{ label: string; detail: string }>;
};

export type EditorialRadar = {
  isEmpty: boolean;
  range: TimelineRange;
  totalJudgment: string;
  judgmentDetail: string;
  leadSignal: EditorialSignal | null;
  secondarySignals: EditorialSignal[];
};

export type EditorialSiblingRow = {
  itemId: string;
  title: string | null;
  titleZh: string | null;
  url: string | null;
  sourceId: string;
  sourceName: string;
  platform: string;
  sourceConfig: unknown;
};

export type EditorialRepresentativeSource = {
  id: string;
  sourceName: string;
  platform: string;
  title: string;
  url: string | null;
  sourceConfig: unknown;
};

function titleOf(cluster: EditorialCluster) {
  return cluster.displayTitle?.trim() || cluster.topic?.trim() || "未命名信号";
}

function scoreCluster(cluster: EditorialCluster) {
  const consensus = cluster.consensusScore ?? 0;
  const breaking = cluster.breakingScore ?? 0;
  const relevance = cluster.sourceQualityScore ?? cluster.crossPlatformScore ?? 0;
  const sourceLift = Math.min(cluster.distinctSources / 6, 1) * 0.08;
  return Number((breaking * 0.42 + consensus * 0.34 + relevance * 0.16 + sourceLift).toFixed(4));
}

function formatScore(value: number | undefined, fallback = 0) {
  return `${Math.round((value ?? fallback) * 100)}`;
}

function buildReasons(cluster: EditorialCluster): EditorialSignalReason[] {
  const consensusDetail =
    cluster.whyConsensus?.[0] ||
    `${cluster.distinctSources} 个来源覆盖，${cluster.weightedDistinctSources.toFixed(1)} 个加权来源`;
  const breakingDetail =
    cluster.whyBreaking?.[0] ||
    (cluster.burstVelocity != null ? `短时间升温 ${cluster.burstVelocity.toFixed(1)}x` : "近期热度上升");
  const relevanceScore = cluster.sourceQualityScore ?? cluster.crossPlatformScore ?? 0;

  return [
    {
      label: "共识",
      value: `${cluster.distinctSources} 源`,
      detail: consensusDetail,
    },
    {
      label: "突发",
      value: formatScore(cluster.breakingScore, cluster.recencyScore),
      detail: breakingDetail,
    },
    {
      label: "相关",
      value: formatScore(relevanceScore),
      detail: `命中高质量来源与跨平台信号，相关度 ${formatScore(relevanceScore)}`,
    },
  ];
}

function buildEditorialTake(cluster: EditorialCluster) {
  const title = titleOf(cluster);
  const sourcePhrase = `${cluster.distinctSources} 个来源`;
  const breaking = cluster.breakingScore ?? 0;
  if (breaking >= 0.75) {
    return `${title} 正在升温，${sourcePhrase} 已经形成交叉验证，适合作为今天优先阅读的主线。`;
  }
  return `${title} 已经形成稳定共识，${sourcePhrase} 的覆盖让它比单篇文章更值得跟进。`;
}

function buildTimeline(cluster: EditorialCluster) {
  return [
    { label: "首次进入窗口", detail: "在当前时间窗内被系统识别为候选信号" },
    { label: "多源覆盖", detail: `${cluster.distinctSources} 个来源给出相关报道或讨论` },
    { label: "进入主焦点", detail: `综合分 ${formatScore(scoreCluster(cluster))}，进入 Today 优先位` },
  ];
}

function toSignal(cluster: EditorialCluster): EditorialSignal {
  const score = scoreCluster(cluster);
  return {
    id: cluster.id,
    title: titleOf(cluster),
    sourceNames: cluster.sourceNames,
    sourceCount: cluster.distinctSources,
    itemCount: cluster.itemCount,
    lastSeenAt: cluster.lastSeenAt,
    score,
    editorialTake: buildEditorialTake(cluster),
    reasons: buildReasons(cluster),
    timeline: buildTimeline(cluster),
  };
}

function mergeCandidates(overview: EditorialOverview) {
  const byId = new Map<string, EditorialCluster>();
  for (const cluster of [...overview.consensusClusters, ...overview.breakingClusters]) {
    const existing = byId.get(cluster.id);
    if (!existing || scoreCluster(cluster) > scoreCluster(existing)) {
      byId.set(cluster.id, cluster);
    }
  }
  return [...byId.values()].sort((a, b) => scoreCluster(b) - scoreCluster(a));
}

export function selectEditorialRadar(overview: EditorialOverview, range: TimelineRange): EditorialRadar {
  const signals = mergeCandidates(overview).map(toSignal);
  const leadSignal = signals[0] ?? null;
  if (!leadSignal) {
    return {
      isEmpty: true,
      range,
      totalJudgment: "今天还没有形成明确主信号",
      judgmentDetail: "当前窗口内仍在收集信源和聚类结果，可以先进入 Read 查看原始流。",
      leadSignal: null,
      secondarySignals: [],
    };
  }

  return {
    isEmpty: false,
    range,
    totalJudgment: `今天有 ${signals.length} 个信号值得注意`,
    judgmentDetail: "排序综合跨源共识、短时间升温和来源质量，优先展示最需要判断的主题。",
    leadSignal,
    secondarySignals: signals.slice(1, 5),
  };
}

export function mapRepresentativeSources(rows: EditorialSiblingRow[]): EditorialRepresentativeSource[] {
  return rows.slice(0, 6).map((row) => ({
    id: row.itemId,
    sourceName: row.sourceName,
    platform: row.platform,
    title: row.titleZh?.trim() || row.title?.trim() || "暂无标题",
    url: row.url,
    sourceConfig: row.sourceConfig,
  }));
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run:

```powershell
corepack pnpm --filter @news/web test -- editorial-radar.test.ts
```

Expected: PASS for the new Editorial Radar tests.

- [ ] **Step 5: Commit the data layer**

Run:

```powershell
git add -- apps/web/lib/editorial-radar.ts apps/web/tests/editorial-radar.test.ts
git commit -m "feat(web): add editorial radar view model"
```

---

### Task 2: Product Information Architecture

**Files:**
- Modify: `apps/web/lib/global-search.ts`
- Modify: `apps/web/tests/global-search.test.ts`

- [ ] **Step 1: Add failing IA tests**

Append to `apps/web/tests/global-search.test.ts`:

```ts
import { DASH_NAV, PRODUCT_NAV_SECTIONS } from "../lib/global-search";

test("product navigation exposes the five approved sections", () => {
  assert.deepEqual(
    PRODUCT_NAV_SECTIONS.map((section) => section.id),
    ["today", "read", "briefs", "sources", "settings"],
  );
  assert.deepEqual(
    PRODUCT_NAV_SECTIONS.map((section) => section.label),
    ["Today", "Read", "Briefs", "Sources", "Settings"],
  );
});

test("command navigation still includes existing feature pages", () => {
  const hrefs = new Set(DASH_NAV.map((entry) => entry.href));
  for (const href of [
    "/",
    "/all",
    "/reports",
    "/sources",
    "/recommended-sources",
    "/creators",
    "/health",
    "/settings",
    "/ops",
  ]) {
    assert.equal(hrefs.has(href), true, `${href} should remain discoverable`);
  }
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run:

```powershell
corepack pnpm --filter @news/web test -- global-search.test.ts
```

Expected: FAIL because `PRODUCT_NAV_SECTIONS` is not exported.

- [ ] **Step 3: Define product navigation and flatten it for search**

Modify the top of `apps/web/lib/global-search.ts` so navigation is driven by these exports:

```ts
export type ProductNavId = "today" | "read" | "briefs" | "sources" | "settings";

export type ProductNavEntry = {
  href: string;
  label: string;
  labelZh: string;
  group: string;
  description: string;
};

export type ProductNavSection = ProductNavEntry & {
  id: ProductNavId;
  children: ProductNavEntry[];
};

export const PRODUCT_NAV_SECTIONS: ProductNavSection[] = [
  {
    id: "today",
    href: "/",
    label: "Today",
    labelZh: "今日判断",
    group: "Today",
    description: "Editorial Radar 与今日主焦点",
    children: [],
  },
  {
    id: "read",
    href: "/all",
    label: "Read",
    labelZh: "阅读",
    group: "Read",
    description: "文章流、搜索、收藏、主题回看",
    children: [
      { href: "/search", label: "Search", labelZh: "搜索", group: "Read", description: "搜索事件、信源和文章" },
      { href: "/favorites", label: "Favorites", labelZh: "收藏", group: "Read", description: "已保存文章" },
      { href: "/categories", label: "Categories", labelZh: "分类", group: "Read", description: "分类洞察" },
      { href: "/keywords", label: "Keywords", labelZh: "关键词", group: "Read", description: "关键词和相关事件" },
    ],
  },
  {
    id: "briefs",
    href: "/reports",
    label: "Briefs",
    labelZh: "简报",
    group: "Briefs",
    description: "日报、公众号草稿和发布记录",
    children: [],
  },
  {
    id: "sources",
    href: "/sources",
    label: "Sources",
    labelZh: "信源",
    group: "Sources",
    description: "信源库、推荐信源、博主订阅和健康",
    children: [
      {
        href: "/recommended-sources",
        label: "Recommended",
        labelZh: "推荐信源",
        group: "Sources",
        description: "待添加的推荐来源",
      },
      { href: "/creators", label: "Creators", labelZh: "博主订阅", group: "Sources", description: "创作者订阅" },
      { href: "/health", label: "Health", labelZh: "信源健康", group: "Sources", description: "抓取质量和健康状态" },
    ],
  },
  {
    id: "settings",
    href: "/settings",
    label: "Settings",
    labelZh: "设置",
    group: "Settings",
    description: "AI 模式、发布渠道、安全和运营入口",
    children: [
      { href: "/ops", label: "Ops", labelZh: "运营", group: "Settings", description: "队列和系统工具" },
      { href: "/stats", label: "Stats", labelZh: "统计", group: "Settings", description: "数据统计与运行指标" },
    ],
  },
];

export const DASH_NAV: Array<{ href: string; label: string; group?: string; subtitle?: string }> =
  PRODUCT_NAV_SECTIONS.flatMap((section) => [
    { href: section.href, label: section.labelZh, group: section.group, subtitle: section.description },
    ...section.children.map((child) => ({
      href: child.href,
      label: child.labelZh,
      group: child.group,
      subtitle: child.description,
    })),
  ]);
```

Keep the existing `SETTINGS_CATALOG`, `scoreMatch`, `filterAndScore`, and `matchText` exports below this block.

- [ ] **Step 4: Run IA tests**

Run:

```powershell
corepack pnpm --filter @news/web test -- global-search.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the IA data**

Run:

```powershell
git add -- apps/web/lib/global-search.ts apps/web/tests/global-search.test.ts
git commit -m "feat(web): define product navigation"
```

---

### Task 3: Product Shell Layout

**Files:**
- Modify: `apps/web/app/(dash)/layout.tsx`

- [ ] **Step 1: Replace route grouping with product sections**

In `apps/web/app/(dash)/layout.tsx`, import `PRODUCT_NAV_SECTIONS`:

```ts
import { PRODUCT_NAV_SECTIONS } from "@/lib/global-search";
```

Remove the `groups` calculation and replace the active-state logic with:

```ts
const activeSection = PRODUCT_NAV_SECTIONS.find(
  (section) => section.href === pathname || section.children.some((child) => child.href === pathname),
);
```

Replace the breadcrumb lookup with:

```ts
const crumbLabel =
  PRODUCT_NAV_SECTIONS.find((section) => section.href === pathname)?.labelZh ??
  PRODUCT_NAV_SECTIONS.flatMap((section) => section.children).find((entry) => entry.href === pathname)?.labelZh ??
  "news-monitor";
```

- [ ] **Step 2: Render the five approved navigation sections**

Replace the current sidebar `<nav>` map with:

```tsx
<nav className="nm-product-nav" aria-label="Product navigation">
  {PRODUCT_NAV_SECTIONS.map((section) => {
    const active = activeSection?.id === section.id;
    return (
      <div key={section.id} className="nm-product-nav__section">
        <Link
          href={section.href}
          className={cn("nm-product-nav__primary", active && "nm-product-nav__primary--active")}
        >
          <span>{section.label}</span>
          <small>{locale === "zh-CN" ? section.labelZh : section.description}</small>
        </Link>
        {section.children.length > 0 ? (
          <div className="nm-product-nav__children">
            {section.children.map((child) => {
              const childActive = pathname === child.href;
              return (
                <Link
                  key={child.href}
                  href={child.href}
                  className={cn("nm-product-nav__child", childActive && "nm-product-nav__child--active")}
                >
                  {locale === "zh-CN" ? child.labelZh : child.label}
                </Link>
              );
            })}
          </div>
        ) : null}
      </div>
    );
  })}
</nav>
```

- [ ] **Step 3: Keep the header quiet**

In the header, keep `AppearanceSwitcher` and command search. Use `crumbLabel` as the only page label and avoid adding dense metrics or secondary navigation in the header.

- [ ] **Step 4: Run lint**

Run:

```powershell
corepack pnpm --filter @news/web lint
```

Expected: PASS, or one clear lint failure in `layout.tsx` that is fixed before continuing.

- [ ] **Step 5: Commit the shell layout**

Run:

```powershell
git add -- 'apps/web/app/(dash)/layout.tsx'
git commit -m "feat(web): simplify dashboard product shell"
```

---

### Task 4: Today Page and Main Signal Drawer

**Files:**
- Modify: `apps/web/app/(dash)/page.tsx`

- [ ] **Step 1: Import the Editorial Radar view model**

At the top of `apps/web/app/(dash)/page.tsx`, add:

```ts
import {
  mapRepresentativeSources,
  selectEditorialRadar,
  type EditorialRadar,
  type EditorialRepresentativeSource,
  type TimelineRange,
} from "@/lib/editorial-radar";
```

Remove `Card`, `SourceAvatar`, `Tabs` only if the final code no longer uses them. Keep `Button`, `Drawer`, `Skeleton`, `useAppearance`, router hooks, and existing fetch helpers that remain useful.

- [ ] **Step 2: Convert loaded stats into `EditorialRadar`**

Inside `DashboardHomeInner`, replace the old `summary` memo with:

```ts
const radar = useMemo<EditorialRadar | null>(() => {
  if (!overview) return null;
  return selectEditorialRadar(overview, range);
}, [overview, range]);
```

Remove the homepage keyword board and long timeline rendering from the first screen. Keep timeline loading only if it is used for a small Read handoff or remove the timeline fetch from the Today page entirely and route deeper reading to `/all`.

- [ ] **Step 3: Add drawer state for the lead signal**

Add this state near the existing state hooks:

```ts
const [mainSignalOpen, setMainSignalOpen] = useState(false);
const [representativeSources, setRepresentativeSources] = useState<EditorialRepresentativeSource[]>([]);
const [representativeLoading, setRepresentativeLoading] = useState(false);
```

Add this function:

```ts
async function openMainSignal(signalId: string) {
  setMainSignalOpen(true);
  setRepresentativeSources([]);
  setRepresentativeLoading(true);
  try {
    const response = await fetch(`/api/clusters/${signalId}/siblings?audience=public`, { cache: "no-store" });
    const json = (await response.json()) as { items?: ClusterSiblingRow[]; error?: string };
    if (!response.ok) throw new Error(json.error || "加载代表来源失败");
    setRepresentativeSources(mapRepresentativeSources(Array.isArray(json.items) ? json.items : []));
  } catch {
    setRepresentativeSources([]);
  } finally {
    setRepresentativeLoading(false);
  }
}
```

- [ ] **Step 4: Replace the returned homepage markup**

Use this structure for the non-loading state:

```tsx
{loading || !radar ? (
  <DashboardSkeleton />
) : (
  <section className="nm-today-shell">
    <div className="nm-today-kicker">Editorial Radar · {range.toUpperCase()}</div>
    <div className="nm-today-judgment">
      <h1>{radar.totalJudgment}</h1>
      <p>{radar.judgmentDetail}</p>
    </div>

    {radar.leadSignal ? (
      <article className="nm-main-signal">
        <div className="nm-main-signal__meta">
          <span>MAIN SIGNAL</span>
          <span>{radar.leadSignal.sourceCount} 个来源</span>
        </div>
        <h2>{radar.leadSignal.title}</h2>
        <p>{radar.leadSignal.editorialTake}</p>
        <div className="nm-signal-reasons">
          {radar.leadSignal.reasons.map((reason) => (
            <div key={reason.label} className="nm-signal-reason">
              <span>{reason.label}</span>
              <strong>{reason.value}</strong>
              <small>{reason.detail}</small>
            </div>
          ))}
        </div>
        <div className="nm-action-row">
          <Button variant="primary" onClick={() => void openMainSignal(radar.leadSignal!.id)}>
            继续阅读
          </Button>
          <Button variant="ghost" onClick={() => router.push("/reports")}>
            生成简报
          </Button>
          <Button variant="ghost" onClick={() => router.push(`/search?q=${encodeURIComponent(radar.leadSignal!.title)}`)}>
            追踪主题
          </Button>
          <Button variant="ghost" onClick={() => router.push("/sources")}>
            查看来源
          </Button>
        </div>
      </article>
    ) : (
      <div className="nm-empty-state">当前窗口还没有形成主焦点。可以进入 Read 查看最新文章流。</div>
    )}

    {radar.secondarySignals.length > 0 ? (
      <section className="nm-secondary-signals" aria-label="今日次重点">
        <div className="nm-section-label">Next Signals</div>
        {radar.secondarySignals.map((signal, index) => (
          <button key={signal.id} type="button" onClick={() => void openMainSignal(signal.id)}>
            <span>{String(index + 2).padStart(2, "0")}</span>
            <strong>{signal.title}</strong>
            <small>{signal.sourceCount} 源 · 综合 {Math.round(signal.score * 100)}</small>
          </button>
        ))}
      </section>
    ) : null}
  </section>
)}
```

- [ ] **Step 5: Add the Main Signal drawer markup**

Below the Today shell, add:

```tsx
<Drawer
  open={mainSignalOpen}
  onClose={() => setMainSignalOpen(false)}
  title={radar?.leadSignal?.title ?? "主焦点"}
  width={760}
>
  {radar?.leadSignal ? (
    <div className="nm-main-drawer">
      <section className="nm-main-drawer__take">
        <div className="nm-section-label">Editorial Take</div>
        <p>{radar.leadSignal.editorialTake}</p>
      </section>
      <section className="nm-signal-reasons">
        {radar.leadSignal.reasons.map((reason) => (
          <div key={reason.label} className="nm-signal-reason">
            <span>{reason.label}</span>
            <strong>{reason.value}</strong>
            <small>{reason.detail}</small>
          </div>
        ))}
      </section>
      <section className="nm-drawer-section">
        <div className="nm-section-label">Representative Sources</div>
        {representativeLoading ? (
          <Skeleton style={{ width: "100%", height: 120, borderRadius: 8 }} />
        ) : representativeSources.length > 0 ? (
          <div className="nm-representative-list">
            {representativeSources.map((source) => (
              <a key={source.id} href={source.url ?? "#"} target="_blank" rel="noreferrer">
                <span>{source.sourceName}</span>
                <strong>{source.title}</strong>
              </a>
            ))}
          </div>
        ) : (
          <div className="nm-muted">暂时没有更多代表来源。</div>
        )}
      </section>
      <section className="nm-drawer-section">
        <div className="nm-section-label">Timeline</div>
        <div className="nm-mini-timeline">
          {radar.leadSignal.timeline.map((item) => (
            <div key={item.label}>
              <span>{item.label}</span>
              <small>{item.detail}</small>
            </div>
          ))}
        </div>
      </section>
      <aside className="nm-drawer-actions">
        <Button variant="primary" onClick={() => router.push("/reports")}>
          生成简报段落
        </Button>
        <Button variant="ghost" onClick={() => router.push(`/search?q=${encodeURIComponent(radar.leadSignal!.title)}`)}>
          追踪这个主题
        </Button>
        <Button variant="ghost" onClick={() => router.push("/all")}>
          查看完整文章流
        </Button>
        <div className="nm-muted">为什么给我看：该信号同时命中共识、突发速度和高质量来源。</div>
      </aside>
    </div>
  ) : null}
</Drawer>
```

If a secondary signal opened the drawer, use a `selectedSignal` state instead of always reading `radar.leadSignal`; the state shape is:

```ts
const [selectedSignalId, setSelectedSignalId] = useState<string | null>(null);
const selectedSignal = useMemo(
  () => [radar?.leadSignal, ...(radar?.secondarySignals ?? [])].find((signal) => signal?.id === selectedSignalId) ?? radar?.leadSignal ?? null,
  [radar, selectedSignalId],
);
```

- [ ] **Step 6: Remove unused long-page functions**

After the Today rewrite, delete unused functions from `page.tsx`: `KeywordEvents`, `KeywordBoard`, timeline merge helpers, expanded group state, load-more state, and old sibling drawer state if no code references them. Keep `formatRelativeTime` only if it is still displayed.

- [ ] **Step 7: Run Web lint and tests**

Run:

```powershell
corepack pnpm --filter @news/web lint
corepack pnpm --filter @news/web test
```

Expected: PASS.

- [ ] **Step 8: Commit the Today page**

Run:

```powershell
git add -- 'apps/web/app/(dash)/page.tsx'
git commit -m "feat(web): rebuild today editorial radar"
```

---

### Task 5: Editorial Visual System

**Files:**
- Modify: `apps/web/app/globals.css`

- [ ] **Step 1: Update global tokens**

Add these tokens to `:root`:

```css
  --ok: #17a35b;
  --warning: #b7791f;
  --editorial-paper: #f5f0e7;
  --editorial-ink: #101010;
  --editorial-rule: rgba(16, 16, 16, 0.16);
```

Add light and paper theme overrides:

```css
:root[data-theme="light"],
:root[data-theme="paper"] {
  --editorial-paper: #fbf8f1;
  --editorial-ink: #101010;
  --editorial-rule: rgba(16, 16, 16, 0.14);
}
```

- [ ] **Step 2: Enforce black primary buttons**

Replace the existing `.nm-btn--primary` rules with:

```css
.nm-btn--primary {
  background: #050505;
  color: #ffffff;
  border-color: #050505;
}

.nm-btn--primary:hover {
  background: #1a1a1a;
  border-color: #1a1a1a;
}
```

Keep `.nm-btn--danger` red and `.nm-btn--ghost` secondary.

- [ ] **Step 3: Add product shell and editorial classes**

Append:

```css
.nm-product-nav {
  display: grid;
  gap: 10px;
  padding: 0 12px;
}

.nm-product-nav__section {
  display: grid;
  gap: 4px;
}

.nm-product-nav__primary,
.nm-product-nav__child {
  border-radius: 8px;
  transition:
    background var(--dur-fast) var(--ease),
    color var(--dur-fast) var(--ease),
    border-color var(--dur-fast) var(--ease);
}

.nm-product-nav__primary {
  display: grid;
  gap: 2px;
  padding: 10px 12px;
  border: 1px solid transparent;
  color: var(--fg-1);
}

.nm-product-nav__primary span {
  color: var(--fg-0);
  font-weight: 700;
}

.nm-product-nav__primary small {
  color: var(--fg-3);
  font-size: 11px;
}

.nm-product-nav__primary--active {
  background: var(--bg-2);
  border-color: var(--border);
}

.nm-product-nav__children {
  display: grid;
  gap: 2px;
  padding-left: 10px;
}

.nm-product-nav__child {
  padding: 6px 10px;
  color: var(--fg-2);
  font-size: 12px;
}

.nm-product-nav__child--active,
.nm-product-nav__child:hover {
  color: var(--fg-0);
  background: var(--bg-2);
}

.nm-today-shell {
  min-height: calc(100vh - var(--header-h) - 40px);
  display: grid;
  align-content: start;
  gap: 22px;
  max-width: 1120px;
  margin: 0 auto;
  padding: clamp(18px, 4vw, 48px) 0;
}

.nm-today-kicker,
.nm-section-label {
  color: var(--fg-3);
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.nm-today-judgment {
  display: grid;
  gap: 10px;
  border-bottom: 1px solid var(--border);
  padding-bottom: 18px;
}

.nm-today-judgment h1 {
  margin: 0;
  max-width: 820px;
  color: var(--fg-0);
  font-family: Georgia, "Times New Roman", serif;
  font-size: clamp(34px, 6vw, 68px);
  line-height: 1.02;
  letter-spacing: 0;
}

.nm-today-judgment p,
.nm-main-signal p,
.nm-main-drawer__take p {
  margin: 0;
  max-width: 760px;
  color: var(--fg-2);
  font-size: 15px;
  line-height: 1.75;
}

.nm-main-signal {
  display: grid;
  gap: 18px;
  padding: clamp(18px, 3vw, 28px) 0;
  border-bottom: 1px solid var(--border);
}

.nm-main-signal__meta {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  color: var(--fg-3);
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.nm-main-signal h2 {
  margin: 0;
  max-width: 900px;
  color: var(--fg-0);
  font-size: clamp(28px, 4vw, 48px);
  line-height: 1.08;
  letter-spacing: 0;
}

.nm-signal-reasons {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.nm-signal-reason {
  display: grid;
  gap: 6px;
  min-height: 112px;
  padding: 14px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-1);
}

.nm-signal-reason span,
.nm-signal-reason small {
  color: var(--fg-3);
  font-size: 12px;
}

.nm-signal-reason strong {
  color: var(--fg-0);
  font-size: 22px;
}

.nm-action-row,
.nm-drawer-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  align-items: center;
}

.nm-secondary-signals {
  display: grid;
  gap: 8px;
  max-width: 900px;
}

.nm-secondary-signals button {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
  text-align: left;
  border: 0;
  border-top: 1px solid var(--border);
  background: transparent;
  color: var(--fg-1);
  padding: 12px 0;
  cursor: pointer;
}

.nm-secondary-signals button:hover strong {
  color: var(--fg-0);
}

.nm-secondary-signals span,
.nm-secondary-signals small {
  color: var(--fg-3);
  font-size: 12px;
}

.nm-secondary-signals strong {
  color: var(--fg-1);
  font-size: 15px;
  line-height: 1.5;
}

.nm-main-drawer {
  display: grid;
  gap: 22px;
}

.nm-drawer-section {
  display: grid;
  gap: 10px;
}

.nm-representative-list {
  display: grid;
  gap: 8px;
}

.nm-representative-list a {
  display: grid;
  gap: 4px;
  padding: 12px 0;
  border-top: 1px solid var(--border);
}

.nm-representative-list span,
.nm-mini-timeline span {
  color: var(--fg-3);
  font-size: 12px;
}

.nm-representative-list strong {
  color: var(--fg-0);
  font-size: 14px;
  line-height: 1.5;
}

.nm-mini-timeline {
  display: grid;
  gap: 10px;
}

.nm-mini-timeline div {
  display: grid;
  gap: 2px;
  padding-left: 14px;
  border-left: 1px solid var(--border);
}

.nm-mini-timeline small {
  color: var(--fg-2);
  font-size: 12px;
  line-height: 1.5;
}
```

- [ ] **Step 4: Add responsive rules**

Append:

```css
@media (max-width: 760px) {
  .nm-today-shell {
    padding: 18px 0 36px;
  }

  .nm-signal-reasons {
    grid-template-columns: 1fr;
  }

  .nm-secondary-signals button {
    grid-template-columns: 32px minmax(0, 1fr);
  }

  .nm-secondary-signals small {
    grid-column: 2;
  }

  .nm-action-row .nm-btn,
  .nm-drawer-actions .nm-btn {
    width: 100%;
  }
}
```

- [ ] **Step 5: Scan for blue primary buttons**

Run:

```powershell
Select-String -Path 'apps/web/app/**/*.tsx','apps/web/app/**/*.css' -Pattern '#1d9bf0|blue|nm-btn--primary' -CaseSensitive
```

Expected: `#1d9bf0` may remain only for avatar coloring. `.nm-btn--primary` should use black background and white text.

- [ ] **Step 6: Run lint, tests, and diff check**

Run:

```powershell
corepack pnpm --filter @news/web lint
corepack pnpm --filter @news/web test
git diff --check
```

Expected: PASS.

- [ ] **Step 7: Commit visual system changes**

Run:

```powershell
git add -- apps/web/app/globals.css
git commit -m "style(web): add editorial radar visual system"
```

---

### Task 6: Build and Browser Verification

**Files:**
- Verify: Web app behavior in the local browser

- [ ] **Step 1: Run the Web build**

Run:

```powershell
corepack pnpm --filter @news/web build
```

Expected: PASS.

- [ ] **Step 2: Start the Web dev server**

Run:

```powershell
corepack pnpm --filter @news/web dev
```

Expected: Next.js prints a localhost URL.

- [ ] **Step 3: Verify Today first screen**

Open the localhost URL and verify:

- Sidebar shows exactly five primary product sections: Today, Read, Briefs, Sources, Settings.
- Today first screen shows one judgment, one Main Signal, three reasons, and up to four secondary signals.
- First screen does not show a long timeline, source health table, queue state, or large statistics grid.
- Main action button is black with white text.
- Secondary buttons are bordered or quiet, not blue primary buttons.

- [ ] **Step 4: Verify Main Signal drawer**

Click `继续阅读` and verify:

- Drawer opens without navigating away.
- Drawer shows editorial take, three reasons, representative sources, mini timeline, and action buttons.
- `生成简报段落` routes to `/reports`.
- `追踪这个主题` routes to `/search?q=...`.
- `查看完整文章流` routes to `/all`.

- [ ] **Step 5: Verify access to legacy capabilities**

Use sidebar or command search to verify these pages still open:

- `/all`
- `/reports`
- `/sources`
- `/recommended-sources`
- `/creators`
- `/health`
- `/settings`
- `/ops`

- [ ] **Step 6: Run final full repository checks**

Run:

```powershell
corepack pnpm check
```

Expected: PASS. If DB integration tests skip because `DATABASE_URL` is absent, record the skip message in the final handoff.

---

## Self-Review

**Spec coverage:**
- Product IA maps to Task 2 and Task 3.
- Today low-density first screen maps to Task 4.
- Main Signal drawer maps to Task 4.
- Black primary buttons and editorial visual rules map to Task 5.
- Existing route access maps to Task 2, Task 3, and Task 6.
- No backend rewrite is included.

**Completeness scan:**
- The plan avoids unspecified implementation slots. Each code-editing task gives concrete file paths, code blocks, commands, and expected outcomes.

**Type consistency:**
- `TimelineRange`, `EditorialOverview`, `EditorialSignal`, and `EditorialSiblingRow` are defined in Task 1 and reused by Task 4.
- `PRODUCT_NAV_SECTIONS` is defined in Task 2 and reused by Task 3.
- CSS class names used in Task 3 and Task 4 are defined in Task 5.
