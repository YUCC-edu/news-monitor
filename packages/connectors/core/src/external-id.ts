/**
 * rss-parser 对部分 Atom/RSS 会把 `guid` / `id` 解析成 Date 或 `{ _: string }`。
 * 若直接传给 `createHash().update()` 会抛错：「Received an instance of Date」。
 */
export function coerceRssIdField(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (typeof value === "string" && value.length > 0) return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  if (typeof value === "object") {
    const rec = value as Record<string, unknown>;
    if (typeof rec._ === "string" && rec._.length > 0) return rec._;
    if (rec._ instanceof Date && !Number.isNaN(rec._.getTime())) return rec._.toISOString();
    if (typeof rec["#text"] === "string" && rec["#text"].length > 0) return rec["#text"];
  }
  return undefined;
}
