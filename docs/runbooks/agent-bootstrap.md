# Agent Bootstrap Runbook

This repository is intended to be handed to a coding agent and started from the repo root.

## Required prerequisites

- Node.js 22 LTS
- pnpm 9+
- Docker Desktop with Compose

## Local dev bootstrap

```powershell
corepack pnpm install
Copy-Item .env.example .env
corepack pnpm nm -- init
corepack pnpm start:dev
```

## Validation sequence

```powershell
corepack pnpm nm -- status
corepack pnpm nm -- ai status --json
corepack pnpm nm -- queue status --json
corepack pnpm nm -- hotspots list --json
corepack pnpm check
```

## Recovery path

- Use `restart-dev` after changing code.
- Use `stop:dev` to stop local web/worker and Docker dependencies.
- If the agent only has HTTP access, prefer `/api/agent/capabilities` and `/api/agent/exec`.

## Source-backed subscription rule

Any "blog subscription" or saved creator feed must be created as a real `source` so it participates in fetch, enrichment, clustering, and hotspot ranking.

