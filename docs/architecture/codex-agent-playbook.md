# Codex Agent Playbook

Date: 2026-05-05

## Goal

Codex is the external editorial agent. News Monitor should spend zero built-in LLM tokens in `AI_MODE=agent`; it should provide structured source context, deterministic channel renderers, and publishing hooks.

## Daily Command

```powershell
corepack pnpm nm -- reports agent-brief --json
```

The output is designed for Codex to read directly:

- `editorial`: recommended topic, selection rubric, questions that must be answered.
- `wechatWriting`: title pattern, writing voice, outline, source material.
- `imageDirection`: image2 prompts locked to the Wander visual style.
- `programmaticOutputs`: WeChat draft, Feishu radar, Obsidian ledger.
- `publishChecklist`: final manual checks before creating a WeChat draft.

## Visual Style

The image brief is fixed around the current Wander reference set:

- black background with white fine line-art;
- stamp/postcard border for brand and closing images;
- structured infographic panels for explainers;
- small yellow V badge accent;
- Wander云上 brand signal;
- low text density and readable large labels;
- avoid stock photography, gradients, noisy cyberpunk colors, and dense text.

## Workflow

1. Run the agent brief command.
2. Codex chooses the strongest topic using the rubric.
3. Codex drafts the WeChat article in the learned voice.
4. Generate images with image2 using the `imageDirection.briefs`.
5. Paste or replace image placeholders in the report editor.
6. Check the exact WeChat draft preview in `/reports`.
7. Push to WeChat draft, Feishu, and Obsidian.

## Channel Split

WeChat is for the long-form argument and your recognizable style.

Feishu is for daily awareness: what happened, what papers/research appeared, what products and engineering changes matter.

Obsidian is for durable knowledge: papers, strange ideas, follow-up questions, source links, and reusable topic cards.

## Maintenance Rule

Preview and publish must keep sharing the same WeChat draft builder. If they diverge, the draft box can again receive different content from what the page displays.
