export type SearchGroupType = "nav" | "setting" | "source" | "creator" | "item";

export type SearchResultRow = {
  id: string;
  type: SearchGroupType;
  title: string;
  subtitle?: string;
  href: string;
  score: number;
  meta?: Record<string, unknown>;
};

export const DASH_NAV: Array<{ href: string; label: string; group?: string }> = [
  { href: "/", label: "总编台", group: "总编流" },
  { href: "/categories", label: "分类", group: "总编流" },
  { href: "/favorites", label: "收藏", group: "总编流" },
  { href: "/link-saves", label: "博主信源", group: "总编流" },
  { href: "/sources", label: "信源库", group: "信源运营" },
  { href: "/recommended-sources", label: "推荐信源", group: "信源运营" },
  { href: "/creators", label: "博主订阅", group: "信源运营" },
  { href: "/health", label: "信源健康", group: "信源运营" },
  { href: "/keywords", label: "关键词", group: "信源运营" },
  { href: "/ops", label: "运营", group: "运营" },
  { href: "/settings", label: "设置", group: "运营" },
];

export const SETTINGS_CATALOG: Array<{
  key: string;
  title: string;
  description: string;
  href: string;
}> = [
  { key: "DATABASE_URL", title: "数据库", description: "Postgres 连接串", href: "/settings" },
  { key: "REDIS_URL", title: "Redis", description: "队列与流后端", href: "/settings" },
  { key: "RSSHUB_BASE", title: "RSSHub", description: "X 博主订阅底座", href: "/settings" },
  { key: "WEWE_RSS_BASE", title: "WeWe-RSS", description: "公众号订阅底座", href: "/settings" },
  { key: "WEWE_RSS_AUTH_CODE", title: "WeWe 认证", description: "公众号认证码", href: "/settings" },
  { key: "AI_MODE", title: "AI 模式", description: "core / llm / agent", href: "/settings" },
  { key: "LLM_BASE_URL", title: "LLM 地址", description: "聊天与 embedding API 地址", href: "/settings" },
  { key: "LLM_CHAT_MODEL", title: "LLM 聊天模型", description: "用于翻译和标注", href: "/settings" },
  { key: "LLM_EMBEDDING_MODEL", title: "LLM 向量模型", description: "用于增强聚类", href: "/settings" },
  { key: "LLM_CONCURRENCY", title: "LLM 并发", description: "限制增强并发", href: "/settings" },
  { key: "LLM_DAILY_REQUEST_BUDGET", title: "LLM 日预算", description: "限制每日增强请求数", href: "/settings" },
  { key: "LOG_LEVEL", title: "日志级别", description: "debug / info / warn / error", href: "/settings" },
  { key: "LOG_MODULES", title: "日志模块过滤", description: "逗号分隔的模块名", href: "/settings" },
];

function includesFolded(haystack: string, needle: string) {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

export function scoreMatch(title: string, subtitle: string | undefined, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  const t = title.toLowerCase();
  const s = (subtitle ?? "").toLowerCase();
  if (t === q) return 120;
  if (t.startsWith(q)) return 100;
  if (t.includes(q)) return 80;
  if (s.startsWith(q)) return 55;
  if (s.includes(q)) return 40;
  return 0;
}

export function filterAndScore<T extends { title: string; subtitle?: string }>(rows: T[], query: string) {
  const q = query.trim();
  if (!q) return rows.map((row) => ({ row, score: 0 }));
  return rows
    .map((row) => ({ row, score: scoreMatch(row.title, row.subtitle, q) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.row.title.localeCompare(b.row.title, "zh-CN"));
}

export function matchText(fields: Array<string | null | undefined>, query: string) {
  const q = query.trim();
  if (!q) return true;
  return fields.some((field) => (field ? includesFolded(field, q) : false));
}
