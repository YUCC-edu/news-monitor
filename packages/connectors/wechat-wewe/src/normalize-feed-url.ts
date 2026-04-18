/**
 * WeWe-RSS 在浏览器里常把地址栏写成 `/dash/feeds/MP_WXS_…`（前端 SPA 路由，
 * 见上游 `AppController` 的 `@Get('/dash*')` → 只返回 `index.hbs` HTML）。
 * 真正返回 Atom/RSS 的是 Nest `FeedsController` 的 `/feeds/:feed`（如 `MP_….atom`）。
 *
 * 阅读器（含 Wander 等）在后台实际拉取的多半是 `/feeds/… .atom`；这里把控制台
 * 复制的「页面地址」映射成同一公众号的官方订阅接口 URL，避免用 HTML 当 XML 解析。
 */
export function normalizeWeWeFeedUrl(raw: string): string {
  const s = raw.trim();
  if (!s) return s;
  try {
    const u = new URL(s);
    const path = u.pathname.replace(/\/+$/, "") || "/";

    const dash = /^\/dash\/feeds\/(MP_WXS_\w+)(?:\.(atom|rss|json))?$/i.exec(path);
    if (dash) {
      const id = dash[1];
      const ext = (dash[2] || "atom").toLowerCase();
      const safe = ext === "rss" || ext === "json" ? ext : "atom";
      u.pathname = `/feeds/${id}.${safe}`;
      return u.toString();
    }

    const feedsBare = /^\/feeds\/(MP_WXS_\w+)$/i.exec(path);
    if (feedsBare) {
      u.pathname = `/feeds/${feedsBare[1]}.atom`;
      return u.toString();
    }

    return s;
  } catch {
    return s;
  }
}
