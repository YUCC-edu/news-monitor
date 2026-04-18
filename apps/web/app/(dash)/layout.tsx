"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { cn } from "@/app/ui/cn";

const NAV: Array<{ href: string; label: string; group?: string }> = [
  { href: "/", label: "时间轴", group: "时间轴" },
  { href: "/categories", label: "分类", group: "时间轴" },
  { href: "/favorites", label: "收藏", group: "时间轴" },
  { href: "/sources", label: "信源", group: "运营" },
  { href: "/creators", label: "博主订阅", group: "运营" },
  { href: "/health", label: "信源健康", group: "运营" },
  { href: "/keywords", label: "关键词", group: "运营" },
  { href: "/stats", label: "统计", group: "系统" },
  { href: "/settings", label: "设置", group: "系统" },
  { href: "/system", label: "系统", group: "系统" },
];

const CRUMB: Record<string, string> = {
  "/": "时间轴",
  "/categories": "分类",
  "/favorites": "收藏",
  "/sources": "信源管理",
  "/creators": "博主订阅",
  "/health": "信源健康",
  "/keywords": "关键词",
  "/stats": "统计",
  "/settings": "设置",
  "/system": "系统",
};

export default function DashLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "/";
  const [mobileNav, setMobileNav] = useState(false);

  useEffect(() => {
    setMobileNav(false);
  }, [pathname]);

  const groups = Array.from(new Set(NAV.map((n) => n.group).filter(Boolean))) as string[];

  return (
    <div className="nm-dash-root">
      <aside
        className="nm-sidebar-desktop"
        style={{
          background: "var(--bg-1)",
          borderRight: "1px solid var(--border)",
          padding: "20px 0",
          display: "flex",
          flexDirection: "column",
          gap: 8,
          position: "sticky",
          top: 0,
          alignSelf: "start",
          height: "100vh",
        }}
      >
        <div
          style={{
            padding: "0 20px 12px",
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <span
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              border: "1px solid var(--border-strong)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: -0.5,
              color: "var(--fg-0)",
              fontFamily: "var(--font-mono)",
            }}
          >
            nm
          </span>
          <div>
            <div style={{ fontWeight: 600, color: "var(--fg-0)", fontSize: 15 }}>
              news-monitor
            </div>
            <div className="nm-muted">黑白 · 极简</div>
          </div>
        </div>
        <nav style={{ display: "flex", flexDirection: "column", gap: 16, flex: 1 }}>
          {groups.map((g) => (
            <div key={g}>
              <div
                style={{
                  padding: "0 20px 6px",
                  fontSize: 10,
                  letterSpacing: 2,
                  color: "var(--fg-3)",
                  textTransform: "uppercase",
                }}
              >
                {g}
              </div>
              {NAV.filter((n) => n.group === g).map((n) => {
                const active = pathname === n.href;
                return (
                  <Link
                    key={n.href}
                    href={n.href}
                    className={cn("nm-nav-link", active && "nm-nav-link--active")}
                    style={{
                      display: "block",
                      padding: "8px 20px",
                      color: active ? "var(--fg-0)" : "var(--fg-2)",
                      borderLeft: active ? "2px solid var(--fg-0)" : "2px solid transparent",
                      transition: "color 120ms ease, border-color 120ms ease",
                    }}
                  >
                    {n.label}
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
            height: "var(--header-h)",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            padding: "0 20px",
            gap: 12,
            position: "sticky",
            top: 0,
            zIndex: 5,
            background: "rgba(0,0,0,0.75)",
            backdropFilter: "blur(10px)",
          }}
        >
          <button
            type="button"
            className="nm-mobile-toggle"
            onClick={() => setMobileNav((v) => !v)}
            aria-label="菜单"
            style={{
              display: "none",
              background: "none",
              border: "1px solid var(--border)",
              borderRadius: 8,
              color: "var(--fg-0)",
              padding: "6px 10px",
              cursor: "pointer",
            }}
          >
            ☰
          </button>
          <span style={{ fontWeight: 600, color: "var(--fg-0)" }}>
            {CRUMB[pathname] ?? "news-monitor"}
          </span>
          <span style={{ marginLeft: "auto" }} className="nm-muted">
            ⌘K 搜索（即将）
          </span>
        </header>

        {mobileNav ? (
          <div
            className="nm-mobile-drawer"
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 50,
              background: "rgba(0,0,0,0.6)",
              backdropFilter: "blur(6px)",
            }}
            onClick={() => setMobileNav(false)}
          >
            <nav
              onClick={(e) => e.stopPropagation()}
              style={{
                width: "min(280px, 85vw)",
                height: "100%",
                background: "var(--bg-1)",
                borderRight: "1px solid var(--border)",
                padding: 16,
              }}
            >
              {NAV.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  style={{
                    display: "block",
                    padding: "10px 8px",
                    color: pathname === n.href ? "var(--fg-0)" : "var(--fg-2)",
                  }}
                >
                  {n.label}
                </Link>
              ))}
            </nav>
          </div>
        ) : null}

        <motion.main
          className="nm-page"
          style={{ padding: "24px 28px 48px", flex: 1 }}
          initial={{ opacity: 0.88 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.14, ease: [0.2, 0.8, 0.2, 1] }}
        >
          {children}
        </motion.main>
      </div>

    </div>
  );
}
