# WeChat Style Learning Design

## Context

News Monitor already has a daily report publishing flow:

- `packages/engine/src/reports.ts` builds a factual report draft from hotspot data.
- `packages/engine/src/publishers.ts` publishes the report to WeChat draft, Feishu, and Obsidian.
- `apps/web/app/(dash)/reports/page.tsx` lets the user generate, edit, and publish reports.

The new feature adds a personal WeChat writing and image style layer on top of that flow. It must not replace the factual report model. The app should preserve the original report as a reliable source draft, then create a separate styled WeChat draft that can be reviewed and edited before publishing.

## Selected Approach

Use a hybrid learning model:

1. Store imported historical article samples.
2. Extract a persistent, editable style profile from those samples.
3. Use the style profile plus representative samples to render a WeChat-specific styled variant for each report.

This is better than a pure template because it can capture recurring writing and visual choices. It is safer than a pure retrieval/LLM approach because the extracted profile is visible, stable, and editable.

## Scope

### In Scope

- Manual import of historical WeChat article samples.
- Each sample stores title, optional source URL, article body, optional WeChat HTML, cover image URL, inline image URLs, and image notes.
- A default style profile summarizes writing style, article structure, layout rules, and image style.
- Daily reports keep their existing factual Markdown, WeChat HTML, Feishu payload, and Obsidian Markdown.
- Reports can also store styled title, styled Markdown, styled WeChat HTML, image briefs, style profile ID, and styled timestamp.
- WeChat publishing uses the styled title and styled HTML when available; otherwise it falls back to existing report fields.
- The Reports page exposes sample import, style profile summary, and styled draft editing.
- Deterministic style extraction and rendering are implemented first so tests and offline mode remain reliable. Future LLM refinement can reuse the same profile shape.

### Out of Scope

- Crawling public WeChat links.
- Batch importing local HTML or Markdown files.
- Uploading or generating real WeChat media assets.
- Automatically publishing to WeChat users. The app still only creates WeChat drafts.
- Fine-tuning a model.

## Data Model

### `writing_style_profiles`

Stores the durable style profile.

- `id`
- `name`
- `description`
- `status`: `active` or `archived`
- `rules`: JSON profile containing writing, layout, and image guidance
- `sample_count`
- `created_at`
- `updated_at`

The first profile is `Default WeChat Style`. The active profile is used when generating styled report variants.

### `writing_style_samples`

Stores imported historical article samples.

- `id`
- `profile_id`
- `title`
- `source_url`
- `content_markdown`
- `wechat_html`
- `cover_image_url`
- `inline_images`
- `image_notes`
- `extracted`
- `created_at`
- `updated_at`

`extracted` stores deterministic signals such as heading count, paragraph length, opening pattern, ending pattern, image count, and title punctuation.

### `reports`

Add optional styled fields:

- `style_profile_id`
- `styled_title`
- `styled_markdown`
- `styled_wechat_html`
- `style_image_briefs`
- `styled_at`

These fields preserve the dual-track model: factual report fields remain unchanged, styled fields are WeChat-specific.

## Engine Design

### Style Extraction

`packages/engine/src/writing-style.ts` owns deterministic style logic:

- Normalize imported samples.
- Extract title shape, heading structure, paragraph length, opening and ending patterns, image usage, and layout hints.
- Merge extracted signals into a profile rules object.
- Produce an editor-friendly style summary.

The extractor does not call external services. This keeps tests fast and lets the feature work in `AI_MODE=core`.

### Styled Rendering

The same module renders a styled WeChat variant from a `ReportDraft` and a style profile:

- The factual clusters and representative items remain the source of truth.
- The styled title follows learned title patterns but does not invent facts.
- The styled Markdown uses a more article-like structure: opening, sectioned observations, short analysis paragraphs, representative links, and closing.
- The styled WeChat HTML uses inline-safe section markup and conservative typography.
- Image briefs are generated for cover and section images. They describe composition, subject matter, mood, color, and safe text usage. They do not generate actual images.

### Publishing

WeChat draft publishing selects:

- `styledTitle ?? title`
- `styledWechatHtml ?? wechatHtml`
- digest from `styledMarkdown ?? markdown`

Feishu and Obsidian continue using existing report fields in this iteration.

## API Design

### Style Profile

- `GET /api/writing-style/profile`
  - Returns the active profile and recent samples.
- `PUT /api/writing-style/profile`
  - Updates name, description, or rules for the active profile.

### Samples

- `POST /api/writing-style/samples`
  - Imports one manual sample and refreshes the profile from all samples.
- `GET /api/writing-style/samples`
  - Lists recent imported samples.

### Reports

- `POST /api/reports/[id]/style`
  - Generates or regenerates the styled WeChat variant for a report.
- Existing report update API accepts styled fields so users can edit the styled draft before publishing.
- Report generation applies the active style automatically when an active profile has samples. If no samples exist, it keeps the existing report flow unchanged.

## Web UI Design

The Reports page gets a focused style panel:

- Active style profile summary.
- Manual sample import form.
- Button to regenerate styled WeChat draft for the selected report.
- Separate editors for factual WeChat HTML and styled WeChat HTML.
- Image briefs displayed near the styled editor so the user can copy prompts into a separate image workflow.

The interface stays operational and dense. It should not become a marketing-style page or a separate writing app.

## Error Handling

- Empty sample title or body returns `400`.
- Invalid image lists are normalized to an empty list.
- If no style profile exists, the app creates the default profile.
- If no samples exist, styled rendering is skipped and report generation still succeeds.
- If styled generation fails during report generation, the factual report is still saved. The error is visible when manually regenerating style.
- WeChat publishing falls back to factual report fields if styled fields are empty.

## Testing

- Unit tests for sample extraction and profile learning.
- Unit tests for styled report rendering preserving facts and producing image briefs.
- Unit tests for WeChat article selection falling back correctly.
- Type/lint/build checks for touched packages.
- Existing report tests remain valid.

## Iteration Plan

1. Add deterministic style learning and rendering primitives.
2. Persist profiles, samples, and styled report fields.
3. Add APIs for profile, samples, and report style regeneration.
4. Wire Reports UI to import samples and edit styled drafts.
5. Verify publishing chooses styled WeChat fields when present.
6. Future iteration: add URL import, batch import, image generation/upload, and optional LLM refinement.
