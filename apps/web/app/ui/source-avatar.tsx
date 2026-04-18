"use client";

import { useState } from "react";
import { cn } from "./cn";

export type SourceLike = {
  kind: string;
  name: string;
  config?: Record<string, unknown> | null;
};

export function resolveAvatarUrl(s: SourceLike): string | null {
  const cfg = s.config ?? {};
  if (s.kind === "wechat-wewe") {
    const u = cfg.avatarUrl;
    if (typeof u === "string" && u.length > 0) return u;
  }
  if (s.kind === "x-rsshub") {
    const h = typeof cfg.handle === "string" ? cfg.handle.replace(/^@/, "").trim() : "";
    if (h.length > 0) {
      return `https://unavatar.io/twitter/${encodeURIComponent(h)}`;
    }
  }
  if (s.kind === "rss") {
    const feedUrl = typeof cfg.feedUrl === "string" ? cfg.feedUrl : "";
    if (!feedUrl) return null;
    try {
      const u = new URL(feedUrl);
      return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(u.hostname)}&sz=64`;
    } catch {
      return null;
    }
  }
  return null;
}

function monogramBg(kind: string): string {
  switch (kind) {
    case "x-rsshub":
      return "var(--avatar-x)";
    case "wechat-wewe":
      return "var(--avatar-wx)";
    case "rss":
      return "var(--avatar-rss)";
    case "hn":
      return "var(--avatar-hn)";
    default:
      return "var(--fg-3)";
  }
}

export function SourceAvatar({
  source,
  size = 40,
  className,
}: {
  source: SourceLike;
  size?: number;
  className?: string;
}) {
  const [broken, setBroken] = useState(false);
  const url = resolveAvatarUrl(source);
  const initial = source.name.trim().slice(0, 1).toUpperCase() || "?";

  if (source.kind === "hn") {
    return (
      <span
        className={cn("nm-avatar nm-avatar--hn", className)}
        style={{ width: size, height: size, fontSize: Math.max(12, size * 0.42) }}
        title={source.name}
        aria-hidden
      >
        Y
      </span>
    );
  }

  if (url && !broken) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt=""
        width={size}
        height={size}
        className={cn("nm-avatar nm-avatar--img", className)}
        style={{ width: size, height: size }}
        onError={() => setBroken(true)}
      />
    );
  }

  return (
    <span
      className={cn("nm-avatar nm-avatar--fallback", className)}
      style={{
        width: size,
        height: size,
        fontSize: Math.max(12, size * 0.38),
        background: monogramBg(source.kind),
      }}
      title={source.name}
    >
      {initial}
    </span>
  );
}
