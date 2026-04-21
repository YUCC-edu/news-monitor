/**
 * 时间轴 / SSE 诊断日志（默认关闭）。
 *
 * - 服务端（Worker、`/api/stream`）：根 `.env` 设 `NM_LOG_TIMELINE=1`
 * - 浏览器（时间轴页 DevTools）：`.env` 设 `NEXT_PUBLIC_NM_LOG_TIMELINE=1` 后重启 `pnpm dev:web`
 */

export function timelineServerDiagEnabled(): boolean {
  const v = process.env.NM_LOG_TIMELINE;
  return v === "1" || v === "true";
}

export function timelineClientDiagEnabled(): boolean {
  const v = process.env.NEXT_PUBLIC_NM_LOG_TIMELINE;
  return v === "1" || v === "true";
}

export function logTimelineServer(
  scope: string,
  message: string,
  extra?: Record<string, unknown>,
): void {
  if (!timelineServerDiagEnabled()) return;
  const tag = `[nm-timeline:${scope}]`;
  if (extra && Object.keys(extra).length > 0) {
    console.info(`${tag} ${message}`, extra);
  } else {
    console.info(`${tag} ${message}`);
  }
}

export function logTimelineClient(
  scope: string,
  message: string,
  extra?: Record<string, unknown>,
): void {
  if (!timelineClientDiagEnabled()) return;
  const tag = `[nm-timeline:${scope}]`;
  if (extra && Object.keys(extra).length > 0) {
    console.info(`${tag} ${message}`, extra);
  } else {
    console.info(`${tag} ${message}`);
  }
}
