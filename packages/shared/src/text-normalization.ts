const NEWS_ALIAS_PATTERNS: Array<[RegExp, string]> = [
  [/\bdeep\s*seek\b/gi, "deepseek"],
  [/\bgoogle[\s._-]*deepmind\b/gi, "googledeepmind"],
  [/\bdeep[\s._-]*mind\b/gi, "deepmind"],
  [/\bmeta[\s._-]*ai\b/gi, "metaai"],
  [/\bx[\s._-]*ai\b/gi, "xai"],
  [/\bdeepseek[\s._-]*v\s*4\b/gi, "deepseekv4"],
  [/\bdeepseek[\s._-]*r\s*1\b/gi, "deepseekr1"],
  [/深度求索[\s._-]*v\s*4/gi, "deepseekv4"],
  [/深度求索[\s._-]*r\s*1/gi, "deepseekr1"],
  [/深度求索/gi, "deepseek"],
  [/\bchat\s*gpt[\s._-]*5(?:[._-]?5)?\b/gi, "gpt55"],
  [/\bchatgpt[\s._-]*5(?:[._-]?5)?\b/gi, "gpt55"],
  [/\bgpt[\s._-]*5(?:[._-]?5)?\b/gi, "gpt55"],
  [/\bgpt[\s._-]*4o\b/gi, "gpt4o"],
  [/\bgpt[\s._-]*4(?:\.\d+)?\b/gi, "gpt4"],
  [/\bclaude[\s._-]*4(?:\.\d+)?\b/gi, "claude4"],
  [/\bclaude[\s._-]*(?:sonnet|opus|haiku)?[\s._-]*4(?:\.\d+)?\b/gi, "claude4"],
  [/\bclaude[\s._-]*code\b/gi, "claudecode"],
  [/\bgemini[\s._-]*2(?:\.\d+)?\b/gi, "gemini2"],
  [/\bqwen[\s._-]*3\b/gi, "qwen3"],
  [/通义千问[\s._-]*3/gi, "qwen3"],
  [/阿里[\s._-]*通义/gi, "qwen"],
  [/通义千问/gi, "qwen"],
  [/\bkimi[\s._-]*k\s*2\b/gi, "kimik2"],
  [/kimi[\s._-]*k\s*2/gi, "kimik2"],
  [/月之暗面/gi, "moonshotai"],
  [/智谱[\s._-]*glm/gi, "zhipuglm"],
  [/智谱/gi, "zhipuai"],
  [/豆包/gi, "doubao"],
  [/阶跃星辰/gi, "stepfun"],
  [/讯飞星火/gi, "sparkdesk"],
  [/百川智能/gi, "baichuanai"],
  [/\bo[\s._-]*3\b/gi, "o3"],
  [/\bcursor\b/gi, "cursor"],
  [/\bcodex\b/gi, "codex"],
  [/\bsora\b/gi, "sora"],
];

const ATTENTION_STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "been",
  "being",
  "but",
  "by",
  "for",
  "from",
  "has",
  "have",
  "how",
  "in",
  "into",
  "is",
  "it",
  "its",
  "new",
  "of",
  "on",
  "or",
  "our",
  "out",
  "over",
  "that",
  "the",
  "their",
  "this",
  "to",
  "up",
  "was",
  "were",
  "what",
  "when",
  "where",
  "which",
  "with",
  "you",
  "your",
  "news",
  "update",
  "updates",
  "latest",
  "today",
  "article",
  "articles",
  "post",
  "posts",
  "blog",
  "report",
  "reports",
  "release",
  "released",
  "releases",
  "launch",
  "launches",
  "launched",
  "announcement",
  "announcements",
  "newsroom",
  "insights",
  "insight",
  "analysis",
  "agent",
  "agents",
  "ai",
  "model",
  "models",
  "event",
  "events",
  "newsletter",
  "coding",
  "code",
  "using",
  "guide",
  "intro",
  "beginner",
  "新闻",
  "新闻动态",
  "动态",
  "更新",
  "最新",
  "发布",
  "发布会",
  "上线",
  "报道",
  "资讯",
  "快讯",
  "内容",
  "文章",
  "相关",
  "行业",
  "行业新闻",
  "观察",
  "解读",
  "分析",
  "评论",
  "教程",
  "指南",
  "入门",
  "使用",
  "应用",
  "关注",
  "多家",
  "信源",
  "跟进",
]);

const PROPER_KEYWORD_DISPLAY = new Map<string, string>([
  ["anthropic", "Anthropic"],
  ["baichuanai", "百川智能"],
  ["claude4", "Claude-4"],
  ["claudecode", "Claude Code"],
  ["codex", "Codex"],
  ["cursor", "Cursor"],
  ["deepseek", "DeepSeek"],
  ["deepseekr1", "DeepSeek-R1"],
  ["deepseekv4", "DeepSeek-V4"],
  ["deepmind", "DeepMind"],
  ["doubao", "豆包"],
  ["gemini2", "Gemini-2"],
  ["googledeepmind", "Google DeepMind"],
  ["gpt4", "GPT-4"],
  ["gpt4o", "GPT-4o"],
  ["gpt55", "GPT-5.5"],
  ["kimik2", "Kimi-K2"],
  ["kimi", "Kimi"],
  ["mistral", "Mistral"],
  ["metaai", "Meta AI"],
  ["moonshotai", "月之暗面"],
  ["o3", "o3"],
  ["openai", "OpenAI"],
  ["qwen", "Qwen"],
  ["qwen3", "Qwen3"],
  ["sora", "Sora"],
  ["sparkdesk", "讯飞星火"],
  ["stepfun", "阶跃星辰"],
  ["xai", "xAI"],
  ["zhipuai", "智谱"],
  ["zhipuglm", "智谱GLM"],
]);

const PROPER_KEYWORD_KEYS = new Set(PROPER_KEYWORD_DISPLAY.keys());

function stripNoise(text: string) {
  return text
    .normalize("NFKC")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/www\.\S+/g, " ")
    .toLowerCase();
}

function normalizeAttentionToken(text: string) {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[._-]+/g, "")
    .replace(/^[^\p{Letter}\p{Number}]+|[^\p{Letter}\p{Number}]+$/gu, "")
    .trim();
}

function toKeywordKey(text: string) {
  return normalizeAttentionToken(text).replace(/\s+/g, "");
}

export function displayAttentionKeyword(keyword: string) {
  const key = toKeywordKey(keyword);
  return PROPER_KEYWORD_DISPLAY.get(key) ?? keyword.trim();
}

export function canonicalizeNewsText(text: string) {
  let out = stripNoise(text);
  for (const [pattern, replacement] of NEWS_ALIAS_PATTERNS) {
    out = out.replace(pattern, replacement);
  }
  return out
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractNewsTokens(text: string) {
  const normalized = canonicalizeNewsText(text);
  return normalized.match(/[\p{Letter}\p{Number}]{2,}/gu) ?? [];
}

export function newsTextFingerprint(text: string) {
  return extractNewsTokens(text).join(" ");
}

export function extractAttentionKeywords(text: string) {
  const normalized = stripNoise(text);
  const aliasMapped = NEWS_ALIAS_PATTERNS.reduce(
    (acc, [pattern, replacement]) => acc.replace(pattern, replacement),
    normalized,
  );
  const asciiTokens = aliasMapped.match(/[a-z0-9][a-z0-9._-]{1,}/gi) ?? [];
  const cleanAsciiTokens = asciiTokens
    .map((token) => normalizeAttentionToken(token))
    .filter((token) => token && !/^\d+$/.test(token) && !ATTENTION_STOPWORDS.has(token));
  const candidates: string[] = [];

  for (const token of cleanAsciiTokens) {
    if (PROPER_KEYWORD_KEYS.has(token)) candidates.push(token);
  }

  for (let i = 0; i < cleanAsciiTokens.length; i += 1) {
    for (let size = 2; size <= 3; size += 1) {
      const phraseTokens = cleanAsciiTokens.slice(i, i + size);
      if (phraseTokens.length !== size) continue;
      const key = toKeywordKey(phraseTokens.join(" "));
      if (PROPER_KEYWORD_KEYS.has(key)) {
        candidates.push(key);
      }
    }
  }

  const seen = new Set<string>();
  const keywords: string[] = [];
  for (const raw of candidates) {
    const token = toKeywordKey(raw);
    if (!token || token.length < 2) continue;
    if (/^\d+$/.test(token)) continue;
    if (ATTENTION_STOPWORDS.has(token)) continue;
    if (/^[a-z]+$/.test(token) && !PROPER_KEYWORD_KEYS.has(token) && token.length < 5) continue;
    if (seen.has(token)) continue;
    seen.add(token);
    keywords.push(displayAttentionKeyword(token));
  }
  return keywords;
}
