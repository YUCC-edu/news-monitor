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

export type ProductNavId = "today" | "read" | "briefs" | "sources" | "settings";

export type ProductNavEntry = {
  href: string;
  label: string;
  labelZh: string;
  group: string;
  description: string;
};

export type ProductNavSection = ProductNavEntry & {
  id: ProductNavId;
  children: ProductNavEntry[];
};

export const PRODUCT_NAV_SECTIONS: ProductNavSection[] = [
  {
    id: "today",
    href: "/",
    label: "Today",
    labelZh: "今日判断",
    group: "Today",
    description: "Editorial Radar 与今日主焦点",
    children: [],
  },
  {
    id: "read",
    href: "/all",
    label: "Read",
    labelZh: "阅读",
    group: "Read",
    description: "文章流、搜索、收藏、主题回看",
    children: [
      { href: "/search", label: "Search", labelZh: "搜索", group: "Read", description: "搜索事件、信源和文章" },
      { href: "/favorites", label: "Favorites", labelZh: "收藏", group: "Read", description: "已保存文章" },
      { href: "/categories", label: "Categories", labelZh: "分类", group: "Read", description: "分类洞察" },
      { href: "/keywords", label: "Keywords", labelZh: "关键词", group: "Read", description: "关键词和相关事件" },
    ],
  },
  {
    id: "briefs",
    href: "/reports",
    label: "Briefs",
    labelZh: "简报",
    group: "Briefs",
    description: "日报、公众号草稿和发布记录",
    children: [],
  },
  {
    id: "sources",
    href: "/sources",
    label: "Sources",
    labelZh: "信源",
    group: "Sources",
    description: "信源库、推荐信源、博主订阅和健康",
    children: [
      {
        href: "/recommended-sources",
        label: "Recommended",
        labelZh: "推荐信源",
        group: "Sources",
        description: "待添加的推荐来源",
      },
      { href: "/creators", label: "Creators", labelZh: "博主订阅", group: "Sources", description: "创作者订阅" },
      { href: "/health", label: "Health", labelZh: "信源健康", group: "Sources", description: "抓取质量和健康状态" },
    ],
  },
  {
    id: "settings",
    href: "/settings",
    label: "Settings",
    labelZh: "设置",
    group: "Settings",
    description: "AI 模式、发布渠道、安全和运营入口",
    children: [
      { href: "/ops", label: "Ops", labelZh: "运营", group: "Settings", description: "队列和系统工具" },
      { href: "/stats", label: "Stats", labelZh: "统计", group: "Settings", description: "数据统计与运行指标" },
    ],
  },
];

export const DASH_NAV: Array<{ href: string; label: string; labelEn?: string; group?: string; subtitle?: string }> =
  PRODUCT_NAV_SECTIONS.flatMap((section) => [
    {
      href: section.href,
      label: section.labelZh,
      labelEn: section.label,
      group: section.group,
      subtitle: `${section.description} · ${section.label} · ${section.group}`,
    },
    ...section.children.map((child) => ({
      href: child.href,
      label: child.labelZh,
      labelEn: child.label,
      group: child.group,
      subtitle: `${child.description} · ${child.label} · ${child.group}`,
    })),
  ]);

export const SETTINGS_CATALOG: Array<{
  key: string;
  title: string;
  description: string;
  href: string;
}> = [
  { key: "DATABASE_URL", title: "数据库", description: "Postgres 连接串", href: "/settings" },
  { key: "REDIS_URL", title: "Redis", description: "队列与流后端", href: "/settings" },
  { key: "RSSHUB_BASE", title: "RSSHub", description: "X 信号与博主订阅底座", href: "/settings" },
  { key: "WEWE_RSS_BASE", title: "WeWe-RSS", description: "公众号订阅底座", href: "/settings" },
  { key: "WEWE_RSS_AUTH_CODE", title: "WeWe 认证", description: "公众号认证码", href: "/settings" },
  { key: "AI_MODE", title: "AI 模式", description: "core / llm / agent", href: "/settings" },
  { key: "LLM_BASE_URL", title: "LLM 地址", description: "聊天与 embedding API 地址", href: "/settings" },
  { key: "LLM_CHAT_MODEL", title: "LLM 聊天模型", description: "用于翻译、标注和摘要", href: "/settings" },
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
