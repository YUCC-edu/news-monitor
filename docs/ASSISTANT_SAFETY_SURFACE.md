# NM Assistant Safety Surface Audit

## Scope

- API paths reviewed:
  - `/api/assistant/chat` (re-export of agent chat)
  - `/api/agent/chat`
  - `/api/agent/add-source`
  - `/api/agent/trigger-reenrich`
  - `/api/agent/list-source-health`
  - `/api/agent/list-trending-clusters`
  - `/api/agent/search-items`
  - `/api/agent/stats-report`

## Capability Matrix

| Endpoint / Tool | Reads business data | Writes business data | Writes system files | Writes system config | Notes |
| --- | --- | --- | --- | --- | --- |
| `search_items` | yes | no | no | no | list items |
| `list_trending_clusters` | yes | no | no | no | curated cluster snapshot |
| `list_source_health` | yes | no | no | no | source diagnostics |
| `stats_report` | yes | no | no | no | overview metrics |
| `add_source` | yes | yes | no | no | source table upsert |
| `trigger_fetch_source` | yes | yes | no | no | enqueue fetch job |
| `trigger_reenrich` (endpoint only) | yes | yes | no | no | enqueue enrich jobs |

## Guardrails Implemented

1. Tool policy guard rejects any tool outside explicit capability map.
2. Policy guard rejects tools marked as system file/config writers.
3. Role guard still enforces read vs write-low actions.
4. Audit logging is best-effort and never blocks user-visible tool execution if audit persistence fails.
5. Error responses return deterministic recovery hints for common operational failures.

## Residual Risk

- `trigger_reenrich` currently uses direct endpoint logic (not yet unified into `runAssistantTool` policy map).
- In-memory rate limit is per-process and non-distributed.
- LLM fallback remains available for general QA; operational actions are still deterministic via intent routing.
