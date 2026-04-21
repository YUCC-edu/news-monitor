# Agent Integration

This project exposes a stable, low-privilege capability layer for external agents.

## Tool Endpoints

- `GET /api/agent/search-items?q=...&limit=20&sort=published|fetched`
  - Tool name: `search_items`
  - Purpose: search timeline items with unified shape for agent consumption.
- `GET /api/agent/list-trending-clusters?limit=20`
  - Tool name: `list_trending_clusters`
  - Purpose: list curated cluster representatives and related source counts.
- `GET /api/agent/list-source-health`
  - Tool name: `list_source_health`
  - Purpose: retrieve source runtime health and remediation hints.
- `POST /api/agent/trigger-reenrich`
  - Tool name: `trigger_reenrich`
  - Purpose: trigger controlled re-enrich operations.
  - Request body:
    ```json
    {
      "scope": "source | window | item",
      "sourceId": "uuid (optional for source scope)",
      "itemId": "uuid (optional for item scope)",
      "since": "ISO timestamp (optional for window scope)",
      "until": "ISO timestamp (optional for window scope)",
      "limit": 100
    }
    ```

## Security and Access

- Prefer read-only tools (`search_items`, `list_trending_clusters`, `list_source_health`) for default agent profiles.
- Grant `trigger_reenrich` only to elevated agent identities.
- Apply reverse-proxy auth and request auditing in production.

## Skills Packaging Notes

- Claude Code / Codex / OpenClaw can consume these endpoints as HTTP tools.
- Keep tool contracts stable; add new optional fields instead of breaking required keys.
- Return structured remediation fields on failures for deterministic recovery behavior.
