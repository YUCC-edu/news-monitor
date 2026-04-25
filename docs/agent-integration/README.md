# Agent Integration

`news-monitor` 现在对外暴露的是稳定能力层，而不是“网页里的聊天功能”。

推荐的接入优先级：
1. `nm` CLI
2. HTTP capability endpoints
3. 兼容型 tool endpoints

## 1. Capability Discovery

```http
GET /api/agent/capabilities
```

返回当前支持的能力清单，例如：
- `sources.list`
- `sources.add`
- `sources.update`
- `sources.fetch`
- `sources.importPreset`
- `items.search`
- `clusters.list`
- `clusters.siblings`
- `hotspots.list`
- `hotspots.explain`
- `stats.overview`
- `health.sources`
- `queue.status`
- `ops.reenrich`
- `ai.status`
- `system.status`

## 2. Generic Execute Endpoint

```http
POST /api/agent/exec
Content-Type: application/json
```

请求体：

```json
{
  "capability": "hotspots.list",
  "input": {
    "range": "7d",
    "limit": 10
  }
}
```

成功返回：

```json
{
  "ok": true,
  "capability": "hotspots.list",
  "data": {
    "total": 10,
    "hotspots": []
  }
}
```

失败返回统一结构：

```json
{
  "ok": false,
  "capability": "sources.add",
  "error": {
    "code": "invalid_input",
    "message": "feedUrl is required",
    "recoveryHint": "Check the capability input schema and retry with valid arguments."
  }
}
```

写操作能力需要携带：
- `x-assistant-role: assistant_write_low`
- `x-assistant-key: <ASSISTANT_API_KEY>`

## 3. CLI-first Examples

### Shell

```powershell
corepack pnpm nm -- hotspots list --range 7d --limit 10 --json
corepack pnpm nm -- hotspots explain --cluster-id "<cluster-id>" --json
corepack pnpm nm -- ai status --json
corepack pnpm nm -- queue status --json
corepack pnpm nm -- stats overview --range 30d --json
corepack pnpm nm -- sources import-preset --preset ai-high-signal --fetch --json
corepack pnpm nm -- sources add --kind rss --name "Reuters Tech" --url "https://feeds.reuters.com/reuters/technologyNews"
```

### curl

```bash
curl -s http://localhost:3000/api/agent/capabilities

curl -s http://localhost:3000/api/agent/exec \
  -H 'Content-Type: application/json' \
  -d '{
    "capability": "items.search",
    "input": { "q": "OpenAI", "limit": 5, "range": "7d" }
  }'
```

### Node.js

```ts
const response = await fetch("http://localhost:3000/api/agent/exec", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    capability: "clusters.list",
    input: { range: "7d", limit: 5, minSources: 2 },
  }),
});

const result = await response.json();
console.log(result);
```

### Python

```python
import requests

resp = requests.post(
    "http://localhost:3000/api/agent/exec",
    json={
        "capability": "system.status",
        "input": {}
    },
    timeout=30,
)

print(resp.json())
```

## 4. Compatible Tool Endpoints

这些 endpoint 继续保留，用于兼容已有 agent/tool 配置：

- `GET /api/agent/search-items`
- `GET /api/agent/list-trending-clusters`
- `GET /api/agent/list-source-health`
- `GET /api/agent/stats-report`
- `POST /api/agent/add-source`
- `POST /api/agent/trigger-fetch-source`
- `POST /api/agent/trigger-reenrich`

但新的集成建议优先走 `capabilities + exec`，这样更接近稳定 contract，也更方便未来扩展 MCP。

## 5. Integration Guidance

- 把 `news-monitor` 当成情报引擎，而不是网页机器人
- 优先消费结构化 JSON，不要依赖页面文案
- 读能力默认开放，写能力显式授权
- CLI 和 HTTP 返回的数据形状尽量保持一致
- 新增能力时优先扩展 contract，而不是单独再造一个聊天专用接口
