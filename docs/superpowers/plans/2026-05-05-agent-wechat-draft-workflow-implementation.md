# Agent WeChat Draft Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a low-token agent workflow that prepares a WeChat draft, lets Codex/image2 return images, uploads those images, creates the WeChat draft, and improves the Categories page into a usable topic-discovery surface.

**Architecture:** Keep current report generation and styled WeChat article builders as the source of truth. Add a small `wechat-draft-workflow` engine module for prepare/complete orchestration, a small `category-insights` helper for page aggregation, and thin CLI/API adapters. Keep cleanup limited to exact duplicate docs assets and ignored local packages.

**Tech Stack:** TypeScript, Next.js App Router, Drizzle/Postgres data access, existing `@news/engine` capabilities, Vitest and Node test runner.

---

### Task 1: Project Health Slimming

**Files:**
- Delete: `docs/assets/demo-dashboard.png`
- Delete: `docs/assets/demo-overview.png`
- Delete: `docs/assets/demo-source-coverage.png`
- Delete: `docs/assets/demo-source-library.png`
- Modify: `.gitignore`

- [ ] **Step 1: Verify duplicate assets are exact duplicates and unreferenced**

Run:

```powershell
$pairs = @(
  @('docs/assets/demo-dashboard.png','docs/assets/overview.png'),
  @('docs/assets/demo-overview.png','docs/assets/quick-start.png'),
  @('docs/assets/demo-source-coverage.png','docs/assets/stats.png'),
  @('docs/assets/demo-source-library.png','docs/assets/recommended-sources.png')
)
foreach ($pair in $pairs) {
  "$($pair[0]) => $((Get-FileHash -Algorithm SHA256 -LiteralPath $pair[0]).Hash)"
  "$($pair[1]) => $((Get-FileHash -Algorithm SHA256 -LiteralPath $pair[1]).Hash)"
}
Select-String -Path (git ls-files | Where-Object { $_ -match '\.(md|ts|tsx|json)$' }) -Pattern 'demo-dashboard.png','demo-overview.png','demo-source-coverage.png','demo-source-library.png' -SimpleMatch -Encoding UTF8
```

Expected: each pair has identical hashes; no references are printed for deleted filenames.

- [ ] **Step 2: Delete exact duplicate tracked assets**

Use `apply_patch` delete hunks for the four files listed above.

- [ ] **Step 3: Add `.superpowers/` to `.gitignore`**

Append:

```gitignore
.superpowers/
```

- [ ] **Step 4: Remove ignored local package zips**

Run:

```powershell
$root = Resolve-Path '.'
$targets = Get-ChildItem -LiteralPath "$root\dist" -Filter 'news-monitor-windows-*-test.zip' -File
foreach ($target in $targets) {
  if (-not $target.FullName.StartsWith((Join-Path $root 'dist'))) { throw "unexpected path $($target.FullName)" }
}
$targets | Remove-Item -Force
```

Expected: local ignored `dist/news-monitor-windows-*-test.zip` files are removed; `git status` does not show them.

- [ ] **Step 5: Commit cleanup**

Run:

```powershell
git status --short
git add -- .gitignore docs/assets
git commit -m "chore: slim duplicate docs assets"
```

Expected: commit succeeds with only `.gitignore` and docs asset deletions.

### Task 2: Category Aggregation Helper

**Files:**
- Create: `apps/web/lib/category-insights.ts`
- Test: `apps/web/tests/category-insights.test.ts`
- Modify: `apps/web/app/(dash)/categories/page.tsx`

- [ ] **Step 1: Write failing tests**

Create `apps/web/tests/category-insights.test.ts`:

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildCategoryInsights } from "../lib/category-insights";

const base = {
  id: "i1",
  sourceName: "Source",
  platform: "rss",
  title: "Title",
  titleZh: null,
  contentZh: null,
  contentText: null,
  tags: [],
  publishedAt: "2026-05-05T00:00:00.000Z",
  fetchedAt: "2026-05-05T01:00:00.000Z",
};

describe("buildCategoryInsights", () => {
  it("counts classified, unclassified, source coverage, and draft candidates", () => {
    const insights = buildCategoryInsights([
      { ...base, id: "i1", sourceName: "A", categoryDomain: ["基础模型"], categoryTopic: ["论文研究"], categoryEntity: ["OpenAI"] },
      { ...base, id: "i2", sourceName: "B", categoryDomain: ["基础模型"], categoryTopic: ["论文研究"], categoryEntity: [] },
      { ...base, id: "i3", sourceName: "C", categoryDomain: [], categoryTopic: [], categoryEntity: [] },
    ]);

    assert.equal(insights.totalItems, 3);
    assert.equal(insights.classifiedItems, 2);
    assert.equal(insights.unclassifiedItems, 1);
    assert.equal(insights.candidateCount, 1);
    assert.equal(insights.byDimension.domain[0].value, "基础模型");
    assert.equal(insights.byDimension.domain[0].itemCount, 2);
    assert.equal(insights.byDimension.domain[0].sourceCount, 2);
  });
});
```

- [ ] **Step 2: Run test and verify failure**

Run:

```powershell
corepack pnpm --filter @news/web test -- tests/category-insights.test.ts
```

Expected: FAIL because `../lib/category-insights` does not exist.

- [ ] **Step 3: Implement helper**

Create `apps/web/lib/category-insights.ts` exporting:

```ts
export type CategoryDimension = "domain" | "topic" | "entity";
export type CategoryInsightItem = {
  id: string;
  sourceName: string;
  categoryDomain?: string[] | null;
  categoryTopic?: string[] | null;
  categoryEntity?: string[] | null;
};

export type CategoryInsightRow = {
  value: string;
  itemCount: number;
  sourceCount: number;
  itemIds: string[];
};

export function buildCategoryInsights(items: CategoryInsightItem[]) {
  const dimensions: CategoryDimension[] = ["domain", "topic", "entity"];
  const byDimension = {
    domain: [] as CategoryInsightRow[],
    topic: [] as CategoryInsightRow[],
    entity: [] as CategoryInsightRow[],
  };
  let classifiedItems = 0;
  for (const item of items) {
    const valuesByDimension = {
      domain: normalizeValues(item.categoryDomain),
      topic: normalizeValues(item.categoryTopic),
      entity: normalizeValues(item.categoryEntity),
    };
    if (dimensions.some((dimension) => valuesByDimension[dimension].length > 0)) classifiedItems += 1;
    for (const dimension of dimensions) {
      addRows(byDimension[dimension], valuesByDimension[dimension], item);
    }
  }
  for (const dimension of dimensions) {
    byDimension[dimension].sort((a, b) => b.itemCount - a.itemCount || b.sourceCount - a.sourceCount || a.value.localeCompare(b.value, "zh-CN"));
  }
  const candidateCount = dimensions.reduce((sum, dimension) => {
    return sum + byDimension[dimension].filter((row) => row.itemCount >= 2 && row.sourceCount >= 2).length;
  }, 0);
  return {
    totalItems: items.length,
    classifiedItems,
    unclassifiedItems: Math.max(0, items.length - classifiedItems),
    candidateCount,
    byDimension,
  };
}
```

- [ ] **Step 4: Run test and verify pass**

Run:

```powershell
corepack pnpm --filter @news/web test -- tests/category-insights.test.ts
```

Expected: PASS.

- [ ] **Step 5: Wire Categories page**

Update `apps/web/app/(dash)/categories/page.tsx` to use `buildCategoryInsights(items)` for summary cards, category counts, source coverage, and clear empty states:

```tsx
const insights = useMemo(() => buildCategoryInsights(items), [items]);
const chipRows = insights.byDimension[dimension];
```

Add empty states for:

- no items loaded
- items loaded but no category data
- selected filters matching nothing

- [ ] **Step 6: Run web tests**

Run:

```powershell
corepack pnpm --filter @news/web test
```

Expected: PASS.

### Task 3: WeChat Draft Workflow Prepare

**Files:**
- Create: `packages/engine/src/wechat-draft-workflow.ts`
- Test: `packages/engine/tests/wechat-draft-workflow.test.ts`
- Modify: `packages/engine/src/contract.ts`
- Modify: `packages/engine/src/service.ts`
- Modify: `packages/engine/src/index.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/engine/tests/wechat-draft-workflow.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { imageSlotsFromBriefs, normalizeWechatDraftInput } from "../src/wechat-draft-workflow";

describe("wechat draft workflow", () => {
  it("normalizes prepare inputs for low-token agent mode", () => {
    expect(normalizeWechatDraftInput({ intent: " 最新研究解读 ", topN: 999 })).toMatchObject({
      intent: "最新研究解读",
      audience: "personal",
      range: "24h",
      topN: 10,
      minSources: 1,
      imageProvider: "agent-image2",
      mode: "prepare",
      allowWebSupplement: false,
    });
  });

  it("turns style image briefs into deterministic image slots", () => {
    expect(imageSlotsFromBriefs([
      { kind: "cover", topic: "Agent", prompt: "cover prompt" },
      { kind: "section", topic: "脉络", prompt: "section prompt" },
    ])).toEqual([
      { slotId: "cover", kind: "cover", topic: "Agent", prompt: "cover prompt", required: true },
      { slotId: "section-1", kind: "section", topic: "脉络", prompt: "section prompt", required: false },
    ]);
  });
});
```

- [ ] **Step 2: Run test and verify failure**

Run:

```powershell
corepack pnpm --filter @news/engine test -- wechat-draft-workflow.test.ts
```

Expected: FAIL because `wechat-draft-workflow` does not exist.

- [ ] **Step 3: Implement normalize and slot helpers**

Create `packages/engine/src/wechat-draft-workflow.ts` with:

```ts
export type WechatDraftImageProvider = "agent-image2" | "http-api" | "none";
export type WechatDraftMode = "prepare" | "complete";
export type WechatDraftInput = {
  intent?: string;
  topic?: string;
  audience?: "public" | "personal";
  range?: "24h" | "72h" | "7d" | "30d" | "90d";
  topN?: number;
  minSources?: number;
  imageProvider?: WechatDraftImageProvider;
  mode?: WechatDraftMode;
  reportId?: string;
  images?: WechatDraftReturnedImage[];
  allowWebSupplement?: boolean;
};
export type NormalizedWechatDraftInput = Required<Pick<WechatDraftInput, "intent" | "audience" | "range" | "topN" | "minSources" | "imageProvider" | "mode" | "allowWebSupplement">> &
  Pick<WechatDraftInput, "topic" | "reportId" | "images">;
export function normalizeWechatDraftInput(raw: unknown): NormalizedWechatDraftInput {
  const input = raw && typeof raw === "object" ? raw as WechatDraftInput : {};
  return {
    intent: cleanText(input.intent) || "最近热点内容",
    topic: cleanText(input.topic) || undefined,
    audience: input.audience === "public" ? "public" : "personal",
    range: reportRanges.includes(input.range as ReportRange) ? input.range as ReportRange : "24h",
    topN: clamp(input.topN, 10, 1, 30),
    minSources: clamp(input.minSources, 1, 1, 20),
    imageProvider: normalizeImageProvider(input.imageProvider),
    mode: input.mode === "complete" ? "complete" : "prepare",
    reportId: cleanText(input.reportId) || undefined,
    images: Array.isArray(input.images) ? input.images : undefined,
    allowWebSupplement: input.allowWebSupplement === true,
  };
}
export function imageSlotsFromBriefs(briefs: unknown): WechatDraftImageSlot[] {
  if (!Array.isArray(briefs)) return [];
  let sectionIndex = 0;
  return briefs.flatMap((brief) => {
    if (!brief || typeof brief !== "object") return [];
    const row = brief as { kind?: unknown; topic?: unknown; prompt?: unknown };
    const kind = row.kind === "cover" ? "cover" : "section";
    const slotId = kind === "cover" ? "cover" : `section-${++sectionIndex}` as const;
    return [{
      slotId,
      kind,
      topic: cleanText(row.topic) || "AI",
      prompt: cleanText(row.prompt) || "clean editorial AI image",
      required: kind === "cover",
    }];
  });
}
```

Clamp `topN` to `1..30`, `minSources` to `1..20`, and default `topN` to `10` when out of range.

- [ ] **Step 4: Run test and verify pass**

Run:

```powershell
corepack pnpm --filter @news/engine test -- wechat-draft-workflow.test.ts
```

Expected: PASS.

- [ ] **Step 5: Add capability schema and catalog entry**

Add `"wechatDraft.create"` to `capabilityNameSchema`, `capabilityInputSchemas`, and `capabilityCatalog`.

- [ ] **Step 6: Add prepare orchestration**

Implement `prepareWechatDraft(input)` using `generateAndSaveDailyReport` for new reports or `getReportWithAttempts` for existing `reportId`. Build article fields with `buildWechatDraftArticle(report)`, return image slots from `report.styleImageBriefs`, and return `status: "needs_images"` for `agent-image2` when slots exist.

- [ ] **Step 7: Wire `executeCapability`**

In `packages/engine/src/service.ts`, add case `"wechatDraft.create"` that calls prepare for `mode: "prepare"` and returns unsupported/incomplete for complete until Task 4:

```ts
case "wechatDraft.create": {
  const input = parseCapabilityInput("wechatDraft.create", rawInput);
  data = await createWechatDraftWorkflow(input);
  break;
}
```

- [ ] **Step 8: Run focused engine tests**

Run:

```powershell
corepack pnpm --filter @news/engine test -- wechat-draft-workflow.test.ts contract.test.ts reports.test.ts
```

Expected: PASS.

### Task 4: Image Return, Upload, and Complete Mode

**Files:**
- Modify: `packages/engine/src/wechat-draft-workflow.ts`
- Modify: `packages/engine/src/publishers.ts`
- Test: `packages/engine/tests/wechat-draft-workflow.test.ts`
- Test: `packages/engine/tests/reports.test.ts`

- [ ] **Step 1: Write failing tests for slot validation and HTML replacement**

Extend `packages/engine/tests/wechat-draft-workflow.test.ts`:

```ts
import { replaceImagePlaceholders, validateReturnedImages } from "../src/wechat-draft-workflow";

it("rejects missing required returned images", () => {
  expect(() => validateReturnedImages(
    [{ slotId: "cover", kind: "cover", topic: "Agent", prompt: "p", required: true }],
    [],
  )).toThrow(/missing_required_image/);
});

it("replaces image2 placeholders with image tags", () => {
  const html = '<p>start</p><p style="text-align:center;color:#64748b;">image2: cover</p>';
  expect(replaceImagePlaceholders(html, [{ slotId: "cover", url: "https://mmbiz.example/cover.jpg", alt: "cover" }]))
    .toContain('<img src="https://mmbiz.example/cover.jpg" alt="cover"');
});
```

- [ ] **Step 2: Run test and verify failure**

Run:

```powershell
corepack pnpm --filter @news/engine test -- wechat-draft-workflow.test.ts
```

Expected: FAIL because helpers are missing.

- [ ] **Step 3: Extract reusable WeChat publish helpers**

In `packages/engine/src/publishers.ts`, export small helpers without changing existing behavior:

```ts
export async function getWechatAccessTokenForPublish() {
  return getWechatAccessToken();
}
export async function createWechatDraftWithArticle(input: { article: WechatDraftArticle; thumbMediaId: string; accessToken?: string }) {
  const accessToken = input.accessToken ?? await getWechatAccessToken();
  return postWechatDraftArticle({ accessToken, article: input.article, thumbMediaId: input.thumbMediaId });
}
export async function uploadWechatImageFromBytes(input: { accessToken: string; bytes: ArrayBuffer; contentType: string; filename?: string; fetchImpl?: FetchLike }) {
  return uploadWechatPermanentImageMaterialBytes(input);
}
```

Keep `publishWechatDraft` calling the new helpers.

- [ ] **Step 4: Implement validation, local/URL image loading, upload, replacement, and complete mode**

In `wechat-draft-workflow.ts`:

- `validateReturnedImages(slots, images)` rejects missing required slots and unknown slots.
- `loadReturnedImage` supports `localPath` and `url`.
- `completeWechatDraft(input)` uploads images, uses cover as `thumb_media_id` when present, replaces placeholders, creates a publish attempt, calls the WeChat draft API helper, and finishes the attempt.

- [ ] **Step 5: Run focused tests**

Run:

```powershell
corepack pnpm --filter @news/engine test -- wechat-draft-workflow.test.ts reports.test.ts
```

Expected: PASS.

### Task 5: CLI and HTTP Agent Entrypoints

**Files:**
- Modify: `scripts/nm-cli.ts`
- Create: `apps/web/app/api/agent/wechat-draft/route.ts`
- Test: `packages/engine/tests/contract.test.ts`

- [ ] **Step 1: Write failing contract test**

Extend `packages/engine/tests/contract.test.ts`:

```ts
it("accepts the wechat draft create capability", () => {
  const parsed = parseCapabilityInput("wechatDraft.create", {
    intent: "最新研究解读",
    imageProvider: "agent-image2",
    mode: "prepare",
  });
  expect(parsed.intent).toBe("最新研究解读");
  expect(capabilityCatalog["wechatDraft.create"].writesData).toBe(true);
});
```

- [ ] **Step 2: Run and verify failure**

Run:

```powershell
corepack pnpm --filter @news/engine test -- contract.test.ts
```

Expected: FAIL until the capability schema/catalog is wired.

- [ ] **Step 3: Add CLI command**

Add usage:

```text
nm reports wechat-draft --intent <text> [--topic <text>] [--mode prepare|complete] [--report-id <uuid>] [--image-provider agent-image2|http-api|none] [--image slot=pathOrUrl] [--json]
```

Parse repeated `--image slot=pathOrUrl` into:

```ts
{ slotId, localPath: value }
```

unless the value starts with `http://` or `https://`, in which case use `{ slotId, url: value }`.

- [ ] **Step 4: Add HTTP route**

Create `apps/web/app/api/agent/wechat-draft/route.ts`:

```ts
import { executeCapability } from "@news/engine";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const result = await executeCapability("wechatDraft.create", body);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
```

- [ ] **Step 5: Run focused tests**

Run:

```powershell
corepack pnpm --filter @news/engine test -- contract.test.ts wechat-draft-workflow.test.ts
corepack pnpm --filter @news/web lint
```

Expected: PASS.

### Task 6: Final Verification and Documentation

**Files:**
- Modify: `README.md`
- Modify: `docs/architecture/codex-agent-playbook.md`

- [ ] **Step 1: Update docs with the new command**

Add the Codex-first command pair:

```powershell
corepack pnpm nm -- reports wechat-draft --intent "最新研究解读" --image-provider agent-image2 --json
corepack pnpm nm -- reports wechat-draft --mode complete --report-id <id> --image cover=C:\path\cover.png --json
```

- [ ] **Step 2: Run engine tests and lint**

Run:

```powershell
corepack pnpm --filter @news/engine test
corepack pnpm --filter @news/engine lint
```

Expected: PASS.

- [ ] **Step 3: Run web tests and lint**

Run:

```powershell
corepack pnpm --filter @news/web test
corepack pnpm --filter @news/web lint
```

Expected: PASS.

- [ ] **Step 4: Run status check**

Run:

```powershell
git status --short
```

Expected: only intentional changes remain.

- [ ] **Step 5: Commit implementation**

Run:

```powershell
git add -- .
git commit -m "feat: add agent wechat draft workflow"
```

Expected: commit succeeds.
