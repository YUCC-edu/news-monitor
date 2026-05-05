# Channel-Specific AI Publishing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render one AI daily report into three distinct publishing products: WeChat explainer draft, Feishu radar, and Obsidian knowledge ledger.

**Architecture:** Keep `ReportDraft` as the factual source. Add small pure rendering helpers in `packages/engine/src/reports.ts` and `packages/engine/src/writing-style.ts`; no schema migration is needed. Tests exercise public render functions and channel-specific text markers.

**Tech Stack:** TypeScript, Vitest, existing `@news/engine` package.

---

### Task 1: Channel-Specific Report Rendering

**Files:**
- Modify: `packages/engine/tests/reports.test.ts`
- Modify: `packages/engine/src/reports.ts`

- [ ] **Step 1: Write failing tests**

Add assertions to `reports.test.ts` that `renderReport(draft)` returns Feishu radar sections and Obsidian knowledge sections.

- [ ] **Step 2: Run tests and verify failure**

Run: `corepack pnpm --filter @news/engine test -- reports.test.ts`

Expected: failures mentioning missing `今日 AI 雷达` or `AI Knowledge Ledger`.

- [ ] **Step 3: Implement render helpers**

In `reports.ts`, add helpers for signal classification, Feishu radar content, and Obsidian knowledge markdown. Replace mojibake Chinese strings in the touched rendering paths with valid UTF-8 Chinese.

- [ ] **Step 4: Run tests and verify pass**

Run: `corepack pnpm --filter @news/engine test -- reports.test.ts`

Expected: all report tests pass.

### Task 2: WeChat Long-Form Style Scaffold

**Files:**
- Modify: `packages/engine/tests/writing-style.test.ts`
- Modify: `packages/engine/src/writing-style.ts`

- [ ] **Step 1: Write failing tests**

Assert `renderStyledReport(draft, profile)` includes `从`, `发展脉络`, `为什么值得关注`, `接下来追踪`, and image placeholders.

- [ ] **Step 2: Run tests and verify failure**

Run: `corepack pnpm --filter @news/engine test -- writing-style.test.ts`

Expected: missing-section failures.

- [ ] **Step 3: Implement WeChat scaffold**

Refactor styled report generation into a long-form AI explainer scaffold with editable Markdown, WeChat inline HTML, and image2-oriented briefs.

- [ ] **Step 4: Run tests and verify pass**

Run: `corepack pnpm --filter @news/engine test -- writing-style.test.ts`

Expected: all writing-style tests pass.

### Task 3: Verification

**Files:**
- No new files.

- [ ] **Step 1: Run focused engine checks**

Run: `corepack pnpm --filter @news/engine lint`

Expected: exit code 0.

Run: `corepack pnpm --filter @news/engine test -- reports.test.ts writing-style.test.ts`

Expected: all focused tests pass.

- [ ] **Step 2: Restart local runtime**

Run: `powershell -ExecutionPolicy Bypass -File ./scripts/restart-web-worker.ps1`

Expected: web and worker restart.

- [ ] **Step 3: Smoke test report API**

Run: request `/api/reports?limit=1` and verify the latest report can still be loaded.
