"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AppearanceSwitcher } from "@/app/ui/appearance-switcher";
import { AssistantWidget } from "@/app/ui/assistant-widget";
import { useAppearance } from "@/app/ui/appearance-provider";
import { cn } from "@/app/ui/cn";
import { CommandPalette } from "@/app/ui/command-palette";
import { DASH_NAV } from "@/lib/global-search";

const CRUMB = {
  "zh-CN": {
    "/": "总编台",
    "/categories": "分类",
    "/favorites": "收藏",
    "/link-saves": "博主信源",
    "/sources": "信源库",
    "/recommended-sources": "推荐信源",
    "/creators": "博主订阅",
    "/health": "信源健康",
    "/keywords": "关键词",
    "/ops": "运营",
    "/settings": "设置",
  },
  "en-US": {
    "/": "News Desk",
    "/categories": "Categories",
    "/favorites": "Favorites",
    "/link-saves": "Blog Sources",
    "/sources": "Source Library",
    "/recommended-sources": "Recommended Sources",
    "/creators": "Creator Feeds",
    "/health": "Source Health",
    "/keywords": "Keywords",
    "/ops": "Ops",
    "/settings": "Settings",
  },
} as const;

const NAV_LABEL_EN: Record<string, string> = {
  总编流: "Desk Flow",
  信源运营: "Source Ops",
  运营: "Ops",
  总编台: "News Desk",
  分类: "Categories",
  收藏: "Favorites",
  博主信源: "Blog Sources",
  信源库: "Source Library",
  推荐信源: "Recommended Sources",
  博主订阅: "Creator Feeds",
  信源健康: "Source Health",
  关键词: "Keywords",
  设置: "Settings",
};

function BrandMark() {
  return (
    <span
      aria-hidden="true"
      style={{
        width: 40,
        height: 40,
        borderRadius: 12,
        border: "1px solid var(--border-strong)",
        display: "inline-grid",
        placeItems: "center",
        position: "relative",
        background: "rgba(255,255,255,0.03)",
        overflow: "hidden",
      }}
    >
      <span
        style={{
          position: "absolute",
          left: 8,
          top: 4,
          fontSize: 18,
          fontWeight: 800,
          fontFamily: "var(--font-mono)",
          color: "var(--fg-0)",
          transform: "skewX(-16deg) rotate(-10deg)",
        }}
      >
        N
      </span>
      <span
        style={{
          position: "absolute",
          right: 8,
          bottom: 3,
          fontSize: 18,
          fontWeight: 800,
          fontFamily: "var(--font-mono)",
          color: "var(--fg-0)",
          transform: "rotate(180deg) skewX(-14deg)",
        }}
      >
        V
      </span>
    </span>
  );
}

export default function DashLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "/";
  const { locale } = useAppearance();
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const groups = Array.from(new Set(DASH_NAV.map((entry) => entry.group).filter(Boolean))) as string[];
  const crumbLabel = CRUMB[locale][pathname as keyof (typeof CRUMB)["zh-CN"]] ?? "news-monitor";

  const sidebarLead = useMemo(
    () =>
      locale === "zh-CN"
        ? {
            brand: "新闻监测",
            workspace: "黑白情报总编台",
            search: "Ctrl/Cmd+K 搜索",
            menu: "打开导航",
          }
        : {
            brand: "news-monitor",
            workspace: "Monochrome newsroom console",
            search: "Ctrl/Cmd+K Search",
            menu: "Open navigation",
          },
    [locale],
  );

  return (
    <div className="nm-dash-root">
      <aside
        className="nm-sidebar-desktop"
        style={{
          background: "var(--bg-1)",
          borderRight: "1px solid var(--border)",
          padding: "18px 0",
          display: "flex",
          flexDirection: "column",
          gap: 10,
          position: "sticky",
          top: 0,
          alignSelf: "start",
          height: "100vh",
        }}
      >
        <div style={{ padding: "0 20px 14px", display: "grid", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <BrandMark />
            <div style={{ display: "grid", gap: 2, minWidth: 0 }}>
              <div style={{ fontWeight: 800, color: "var(--fg-0)", fontSize: 16, letterSpacing: 0.2 }}>
                {sidebarLead.brand}
              </div>
            </div>
          </div>

          <div
            style={{
              border: "1px solid var(--border)",
              borderRadius: 10,
              padding: "10px 12px",
              background: "rgba(255,255,255,0.02)",
            }}
          >
            <div style={{ color: "var(--fg-0)", fontWeight: 700, fontSize: 13 }}>{sidebarLead.workspace}</div>
          </div>
        </div>

        <nav style={{ display: "flex", flexDirection: "column", gap: 18, flex: 1 }}>
          {groups.map((group) => (
            <div key={group}>
              <div
                style={{
                  padding: "0 20px 8px",
                  fontSize: 10,
                  letterSpacing: 1.8,
                  color: "var(--fg-3)",
                  textTransform: "uppercase",
                }}
              >
                {locale === "zh-CN" ? group : NAV_LABEL_EN[group] ?? group}
              </div>
              {DASH_NAV.filter((entry) => entry.group === group).map((entry) => {
                const active = pathname === entry.href;
                return (
                  <Link
                    key={entry.href}
                    href={entry.href}
                    className={cn("nm-nav-link", active && "nm-nav-link--active")}
                    style={{
                      display: "block",
                      padding: "9px 20px",
                      color: active ? "var(--fg-0)" : "var(--fg-2)",
                      borderLeft: active ? "2px solid var(--fg-0)" : "2px solid transparent",
                      background: active ? "rgba(255,255,255,0.03)" : "transparent",
                      transition: "color 120ms ease, border-color 120ms ease, background 120ms ease",
                    }}
                  >
                    {locale === "zh-CN" ? entry.label : NAV_LABEL_EN[entry.label] ?? entry.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
      </aside>

      <div style={{ minWidth: 0, display: "flex", flexDirection: "column" }}>
        <header
          style={{
            minHeight: "var(--header-h)",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            padding: "0 20px",
            gap: 12,
            position: "sticky",
            top: 0,
            zIndex: 5,
            background: "color-mix(in srgb, var(--bg-1) 88%, transparent)",
            backdropFilter: "blur(12px)",
          }}
        >
          <div style={{ display: "grid", gap: 2 }}>
            <span style={{ fontWeight: 600, color: "var(--fg-0)" }}>{crumbLabel}</span>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
            <AppearanceSwitcher />
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              style={{
                border: "1px solid var(--border)",
                background: "var(--bg-1)",
                color: "var(--fg-1)",
                borderRadius: 8,
                padding: "8px 12px",
                cursor: "pointer",
              }}
            >
              {sidebarLead.search}
            </button>
          </div>
        </header>

        <main style={{ padding: 20, minWidth: 0 }}>
          <div style={{ maxWidth: 1560, margin: "0 auto" }}>{children}</div>
        </main>
      </div>

      <AssistantWidget pagePath={pathname} />
      <CommandPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}
