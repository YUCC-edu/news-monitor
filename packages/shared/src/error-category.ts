export type ErrorCategory =
  | "auth"
  | "network"
  | "timeout"
  | "rate_limit"
  | "not_found"
  | "format"
  | "upstream"
  | "config"
  | "unknown";

const CATEGORY_HINTS: Array<{ category: ErrorCategory; tests: RegExp[] }> = [
  { category: "auth", tests: [/\b401\b/, /\b403\b/, /unauthorized/i, /forbidden/i, /auth/i] },
  {
    category: "network",
    tests: [/econnrefused/i, /enotfound/i, /fetch failed/i, /network/i, /socket hang up/i],
  },
  { category: "timeout", tests: [/timeout/i, /aborted/i, /timed out/i] },
  { category: "rate_limit", tests: [/\b429\b/, /rate.?limit/i, /too many requests/i] },
  { category: "not_found", tests: [/\b404\b/, /not found/i] },
  { category: "format", tests: [/atom 解析失败/i, /parse/i, /html/i, /invalid json/i] },
  { category: "upstream", tests: [/\b5\d\d\b/, /bad gateway/i, /upstream/i] },
  { category: "config", tests: [/is not set/i, /must be/i, /unsupported key/i, /invalid/i] },
];

export function categorizeErrorMessage(message: string | null | undefined): ErrorCategory {
  if (!message) return "unknown";
  const raw = message.trim();
  for (const row of CATEGORY_HINTS) {
    if (row.tests.some((re) => re.test(raw))) return row.category;
  }
  return "unknown";
}

export function classifyRemediation(category: ErrorCategory): "retry" | "manual" | "ignore" {
  switch (category) {
    case "network":
    case "timeout":
    case "rate_limit":
    case "upstream":
      return "retry";
    case "auth":
    case "config":
    case "format":
    case "not_found":
      return "manual";
    default:
      return "ignore";
  }
}
