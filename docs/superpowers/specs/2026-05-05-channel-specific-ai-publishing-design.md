# Channel-Specific AI Publishing Design

## Goal

Optimize report publishing so each destination has a distinct job:

- WeChat draft: a long-form AI explainer draft in the user's voice, ready for manual rewriting and image insertion.
- Feishu: a concise daily AI radar for tracking what is getting attention and what new research appeared.
- Obsidian: durable knowledge notes that preserve useful papers, unusual ideas, and follow-up threads.

## Product Shape

The report generator keeps one factual `ReportDraft` as the source of truth. Rendering then creates channel-specific outputs:

- `markdown` remains the factual internal report.
- `feishuPayload` becomes a short operational digest.
- `obsidianMarkdown` becomes a structured knowledge ledger.
- `styledMarkdown`, `styledWechatHtml`, and `styleImageBriefs` become the WeChat writing workflow output.

No new database tables are required for this iteration.

## WeChat Draft

The WeChat draft should no longer look like a generic news list. It should provide a first draft for an AI essay:

1. Start from the strongest AI signal, or fall back to the best article.
2. Use a title pattern like `从 X 看 AI 正在发生什么`.
3. Structure the article as:
   - opening observation
   - background and timeline
   - what changed
   - why it matters
   - what to watch next
4. Insert image placeholders after the opening and after major sections.
5. Generate `styleImageBriefs` for cover and section images suitable for image2 generation.

The output is intentionally editable. It should preserve facts and links while giving the user a strong writing scaffold.

## Feishu Radar

Feishu should answer: "What should I pay attention to today?"

It should include:

- overall signal count and source count
- top 3 attention items
- research/paper candidates
- product/engineering dynamics
- watchlist links

It should be compact enough to scan on mobile.

## Obsidian Notes

Obsidian should answer: "What is worth keeping?"

It should include:

- YAML frontmatter
- daily overview
- papers/research section
- unusual ideas section
- engineering/product section
- durable topic cards generated from clusters
- original source links

The writing should favor future retrieval over social sharing.

## Error Handling

If no AI clusters exist, the renderers fall back to item-level summaries. If no paper-like links are detected, the paper section explicitly says no strong candidate was found. WeChat image prompts still generate from the top topic or report title.

## Testing

Add tests that assert:

- WeChat styled output contains long-form sections and image placeholders.
- Feishu payload contains radar sections.
- Obsidian markdown contains knowledge-ledger sections and paper/idea buckets.
- Existing publish and media-id behavior remains intact.
