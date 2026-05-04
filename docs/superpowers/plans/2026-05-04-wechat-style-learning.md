# WeChat Style Learning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a WeChat style learning layer that imports historical article samples, extracts a reusable profile, and creates editable styled WeChat drafts for generated reports.

**Architecture:** Keep factual reports as the source of truth and store styled WeChat variants separately on `reports`. Add profile and sample tables in `@news/db`, deterministic learning/rendering in `@news/engine`, Next.js APIs for import/regeneration, and a compact Reports-page UI.

**Tech Stack:** TypeScript, Drizzle/Postgres, Vitest, Next.js App Router, existing `@news/engine` and `@news/db` workspace packages.

---

## File Structure

- Create `packages/engine/src/writing-style.ts`: pure extraction, profile learning, styled rendering, and report-level orchestration.
- Modify `packages/engine/src/index.ts`: export writing style APIs.
- Modify `packages/engine/src/reports.ts`: optionally apply an active style after saving a report.
- Modify `packages/engine/src/publishers.ts`: choose styled WeChat fields when present.
- Modify `packages/engine/tests/reports.test.ts`: add tests for styled field selection.
- Create `packages/engine/tests/writing-style.test.ts`: TDD coverage for learning and rendering.
- Modify `packages/db/src/schema.ts`: add style profile/sample tables and styled report columns.
- Modify `packages/db/src/ops.ts`: add CRUD and report styled-field operations.
- Create `packages/db/drizzle/0013_wechat_style_learning.sql`: migration.
- Modify `packages/db/drizzle/meta/_journal.json`: register the migration.
- Create `apps/web/app/api/writing-style/profile/route.ts`: get/update active profile.
- Create `apps/web/app/api/writing-style/samples/route.ts`: list/import samples.
- Create `apps/web/app/api/reports/[id]/style/route.ts`: regenerate styled report.
- Modify `apps/web/app/api/reports/[id]/route.ts`: accept styled fields in report edits.
- Modify `apps/web/app/(dash)/reports/page.tsx`: add style profile/sample import/styled editor controls.

## Task 1: Pure Style Learning

**Files:**
- Create: `packages/engine/src/writing-style.ts`
- Create: `packages/engine/tests/writing-style.test.ts`
- Modify: `packages/engine/src/index.ts`

- [ ] **Step 1: Write failing tests**

Add tests that import `learnWritingStyleFromSamples`, `renderStyledReport`, and `normalizeWritingStyleSample`.

Expected assertions:

```ts
expect(profile.sampleCount).toBe(2);
expect(profile.rules.structure.preferredSectionCount).toBeGreaterThan(0);
expect(profile.rules.image.coverPrompt).toContain("cover");
expect(rendered.title).toContain("AI Agent");
expect(rendered.markdown).toContain("Browser agent update");
expect(rendered.wechatHtml).toContain("<section");
expect(rendered.imageBriefs[0]?.kind).toBe("cover");
```

- [ ] **Step 2: Run RED**

Run: `corepack pnpm --filter @news/engine test -- writing-style.test.ts`

Expected: FAIL because `writing-style.ts` exports do not exist.

- [ ] **Step 3: Implement pure module**

Implement:

```ts
export type WritingStyleSampleInput = { title: string; contentMarkdown?: string; wechatHtml?: string; sourceUrl?: string; coverImageUrl?: string; inlineImages?: string[]; imageNotes?: string; };
export type WritingStyleProfileRules = { summary: string; title: { patterns: string[]; punctuation: string[] }; structure: { preferredSectionCount: number; averageParagraphLength: number; openingStyle: string; endingStyle: string }; layout: { headingPrefix: string; paragraphTone: string; htmlSectionStyle: string }; image: { coverPrompt: string; inlinePrompt: string; notes: string[] } };
export function normalizeWritingStyleSample(input: WritingStyleSampleInput): NormalizedWritingStyleSample;
export function extractWritingStyleSignals(sample: NormalizedWritingStyleSample): WritingStyleSignals;
export function learnWritingStyleFromSamples(samples: WritingStyleSampleInput[]): LearnedWritingStyleProfile;
export function renderStyledReport(draft: ReportDraft, profile: LearnedWritingStyleProfile): StyledReportVariant;
```

Keep implementation deterministic and offline-safe.

- [ ] **Step 4: Run GREEN**

Run: `corepack pnpm --filter @news/engine test -- writing-style.test.ts`

Expected: PASS.

## Task 2: Persistence

**Files:**
- Modify: `packages/db/src/schema.ts`
- Modify: `packages/db/src/ops.ts`
- Create: `packages/db/drizzle/0013_wechat_style_learning.sql`
- Modify: `packages/db/drizzle/meta/_journal.json`

- [ ] **Step 1: Write failing type-level integration in ops**

Add exported operations:

```ts
export async function ensureDefaultWritingStyleProfile()
export async function getActiveWritingStyleProfile()
export async function listWritingStyleSamples(limit = 30)
export async function createWritingStyleSample(input: WritingStyleSampleCreateInput)
export async function updateWritingStyleProfile(input: WritingStyleProfileUpdateInput)
export async function refreshWritingStyleProfileFromSamples(profileId: string, rules: unknown, sampleCount: number)
export async function setReportStyledContent(input: ReportStyledContentInput)
```

- [ ] **Step 2: Run RED**

Run: `corepack pnpm --filter @news/db lint`

Expected: FAIL until schema and operation types exist.

- [ ] **Step 3: Implement schema, migration, ops**

Add `writingStyleProfiles`, `writingStyleSamples`, and styled report columns. Use nullable styled fields on reports so existing rows remain valid.

- [ ] **Step 4: Run GREEN**

Run: `corepack pnpm --filter @news/db lint`

Expected: PASS.

## Task 3: Engine Orchestration and Publishing

**Files:**
- Modify: `packages/engine/src/writing-style.ts`
- Modify: `packages/engine/src/reports.ts`
- Modify: `packages/engine/src/publishers.ts`
- Modify: `packages/engine/tests/reports.test.ts`

- [ ] **Step 1: Write failing tests**

Test that WeChat article payload selects styled fields when present and falls back to factual fields when absent.

- [ ] **Step 2: Run RED**

Run: `corepack pnpm --filter @news/engine test -- reports.test.ts`

Expected: FAIL because the selector does not exist.

- [ ] **Step 3: Implement orchestration**

Add:

```ts
export async function generateStyledReportForReport(reportId: string, profileId?: string)
export function selectWechatArticleFields(report: { title: string; markdown: string; wechatHtml: string; styledTitle?: string | null; styledMarkdown?: string | null; styledWechatHtml?: string | null; })
```

`generateAndSaveDailyReport` should attempt styled generation only if an active profile has samples.

- [ ] **Step 4: Run GREEN**

Run: `corepack pnpm --filter @news/engine test -- reports.test.ts writing-style.test.ts`

Expected: PASS.

## Task 4: Web APIs

**Files:**
- Create: `apps/web/app/api/writing-style/profile/route.ts`
- Create: `apps/web/app/api/writing-style/samples/route.ts`
- Create: `apps/web/app/api/reports/[id]/style/route.ts`
- Modify: `apps/web/app/api/reports/[id]/route.ts`

- [ ] **Step 1: Add API code**

Implement manual sample import, active profile read/update, and report style regeneration. Validate empty title/body with `400`.

- [ ] **Step 2: Run type check**

Run: `corepack pnpm --filter @news/web lint`

Expected: PASS after API types compile.

## Task 5: Reports UI

**Files:**
- Modify: `apps/web/app/(dash)/reports/page.tsx`

- [ ] **Step 1: Add state and fetches**

Add `styleProfile`, `styleSamples`, sample form state, `loadStyle`, `importSample`, and `regenerateStyle`.

- [ ] **Step 2: Add compact UI**

Add a style panel above the selected report editor. Keep the factual editor and add a styled WeChat editor plus image brief list.

- [ ] **Step 3: Run lint**

Run: `corepack pnpm --filter @news/web lint`

Expected: PASS.

## Task 6: Final Verification

**Files:** all touched files.

- [ ] **Step 1: Run package tests**

Run:

```powershell
corepack pnpm --filter @news/engine test
corepack pnpm --filter @news/db lint
corepack pnpm --filter @news/web lint
```

Expected: all commands exit 0.

- [ ] **Step 2: Inspect diff**

Run: `git diff --stat`

Expected: only style-learning and planned report/publish files are touched.

- [ ] **Step 3: Report residual risks**

Call out any verification that could not run and any existing unrelated dirty files.
