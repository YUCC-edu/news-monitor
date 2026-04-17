export type SimpleLang = "zh" | "en";

/**
 * 极轻量语种判别：只看 CJK 字符占比，>=30% 视为中文，否则按英文处理。
 * 仅用于「是否需要翻译」这种粗判，不替代真正的语种检测。
 */
export function detectLangSimple(text: string): SimpleLang {
  if (!text) return "en";
  const cjkMatches = text.match(/[\u4e00-\u9fff]/g);
  const cjkCount = cjkMatches ? cjkMatches.length : 0;
  return cjkCount / text.length >= 0.3 ? "zh" : "en";
}
