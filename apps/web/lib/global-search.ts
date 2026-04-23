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
  { href: "/", label: "时间轴", group: "时间轴" },
  { href: "/categories", label: "分类", group: "时间轴" },
  { href: "/favorites", label: "收藏", group: "时间轴" },
  { href: "/link-saves", label: "链接收藏", group: "时间轴" },
  { href: "/sources", label: "信源", group: "运营" },
  { href: "/creators", label: "博主订阅", group: "运营" },
  { href: "/health", label: "信源健康", group: "运营" },
  { href: "/keywords", label: "关键词", group: "运营" },
  { href: "/stats", label: "统计", group: "系统" },
  { href: "/ops", label: "运维", group: "系统" },
  { href: "/settings", label: "设置", group: "系统" },
];

export const SETTINGS_CATALOG: Array<{ key: string; title: string; description: string; href: string }> = [
  { key: "DATABASE_URL", title: "数据库连接", description: "Postgres 连接地址", href: "/settings" },
  { key: "REDIS_URL", title: "Redis连接", description: "队列和事件流依赖", href: "/settings" },
  { key: "RSSHUB_BASE", title: "RSSHub 地址", description: "X 博主抓取基地址", href: "/settings" },
  { key: "WEWE_RSS_BASE", title: "WeWe-RSS 地址", description: "公众号抓取基地址", href: "/settings" },
  { key: "WEWE_RSS_AUTH_CODE", title: "WeWe 授权码", description: "公众号授权 code（ASCII）", href: "/settings" },
  { key: "LLM_BASE_URL", title: "LLM 接口地址", description: "chat/embedding API 基地址", href: "/settings" },
  { key: "LLM_CHAT_MODEL", title: "LLM 对话模型", description: "用于翻译与打标", href: "/settings" },
  { key: "LLM_EMBEDDING_MODEL", title: "LLM 向量模型", description: "用于聚类 embedding", href: "/settings" },
  { key: "LOG_LEVEL", title: "日志级别", description: "debug/info/warn/error", href: "/settings" },
  { key: "LOG_MODULES", title: "日志模块过滤", description: "逗号分隔模块名", href: "/settings" },
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

export function filterAndScore<T extends { title: string; subtitle?: string }>(
  rows: T[],
  query: string,
) {
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
