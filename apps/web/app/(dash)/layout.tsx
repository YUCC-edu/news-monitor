"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { AppearanceSwitcher } from "@/app/ui/appearance-switcher";
import { AssistantWidget } from "@/app/ui/assistant-widget";
import { useAppearance } from "@/app/ui/appearance-provider";
import { cn } from "@/app/ui/cn";
import { CommandPalette } from "@/app/ui/command-palette";
import { PRODUCT_NAV_SECTIONS } from "@/lib/global-search";

function BrandMark() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 108 52"
      style={{
        width: 50,
        height: 34,
        display: "block",
        color: "var(--fg-0)",
        flex: "0 0 auto",
      }}
    >
      <path
        d="M6 44 L26 8 L46 44 L66 8"
        fill="none"
        stroke="currentColor"
        strokeWidth="9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M64 44 L82 8 L100 44"
        fill="none"
        stroke="currentColor"
        strokeWidth="9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
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

  const activeSection = PRODUCT_NAV_SECTIONS.find(
    (section) => section.href === pathname || section.children.some((child) => child.href === pathname),
  );
  const crumbSection = PRODUCT_NAV_SECTIONS.find((section) => section.href === pathname);
  const crumbChild = PRODUCT_NAV_SECTIONS.flatMap((section) => section.children).find(
    (entry) => entry.href === pathname,
  );
  const crumbLabel =
    locale === "zh-CN"
      ? (crumbSection?.labelZh ?? crumbChild?.labelZh ?? "news-monitor")
      : (crumbSection?.label ?? crumbChild?.label ?? "news-monitor");
  const searchLabel = locale === "zh-CN" ? "Ctrl/Cmd+K 搜索" : "Ctrl/Cmd+K Search";

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
              <div style={{ fontWeight: 800, color: "var(--fg-0)", fontSize: 17, letterSpacing: 0 }}>
                News-Monitor
              </div>
            </div>
          </div>
        </div>

        <nav className="nm-product-nav" aria-label="Product navigation">
          {PRODUCT_NAV_SECTIONS.map((section) => {
            const active = activeSection?.id === section.id;
            const sectionLabel = locale === "zh-CN" ? section.labelZh : section.label;
            const sectionDetail = locale === "zh-CN" ? section.labelZh : section.description;
            return (
              <div key={section.id} className="nm-product-nav__section">
                <Link
                  href={section.href}
                  className={cn("nm-product-nav__primary", active && "nm-product-nav__primary--active")}
                >
                  <span>{sectionLabel}</span>
                  <small>{sectionDetail}</small>
                </Link>
                {section.children.length > 0 ? (
                  <div className="nm-product-nav__children">
                    {section.children.map((child) => {
                      const childActive = pathname === child.href;
                      return (
                        <Link
                          key={child.href}
                          href={child.href}
                          className={cn("nm-product-nav__child", childActive && "nm-product-nav__child--active")}
                        >
                          {locale === "zh-CN" ? child.labelZh : child.label}
                        </Link>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })}
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
              {searchLabel}
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
