"use client";

import Link from "next/link";
import { useState } from "react";
import { useAppearance } from "./appearance-provider";

export function AppearanceSwitcher() {
  const [open, setOpen] = useState(false);
  const { locale, theme, setLocale, setTheme, copy } = useAppearance();

  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        aria-label={copy.appearanceLabel}
        onClick={() => setOpen((value) => !value)}
        style={{
          border: "1px solid var(--border)",
          background: "transparent",
          color: "var(--fg-2)",
          borderRadius: 10,
          width: 36,
          height: 36,
          cursor: "pointer",
        }}
        title={copy.appearanceLabel}
      >
        ◐
      </button>
      {open ? (
        <div
          style={{
            position: "absolute",
            top: 44,
            right: 0,
            width: 240,
            padding: 12,
            border: "1px solid var(--border)",
            borderRadius: 12,
            background: "var(--bg-1)",
            boxShadow: "0 18px 48px rgba(0,0,0,0.28)",
            display: "grid",
            gap: 12,
            zIndex: 20,
          }}
        >
          <div style={{ color: "var(--fg-0)", fontWeight: 600 }}>{copy.quickSwitchTitle}</div>
          <div style={{ display: "grid", gap: 6 }}>
            <div className="nm-muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1.1 }}>
              {copy.languageLabel}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <SegmentButton active={locale === "zh-CN"} onClick={() => setLocale("zh-CN")}>
                {copy.languageChinese}
              </SegmentButton>
              <SegmentButton active={locale === "en-US"} onClick={() => setLocale("en-US")}>
                {copy.languageEnglish}
              </SegmentButton>
            </div>
          </div>
          <div style={{ display: "grid", gap: 6 }}>
            <div className="nm-muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1.1 }}>
              {copy.themeLabel}
            </div>
            <div style={{ display: "grid", gap: 6 }}>
              <SegmentButton active={theme === "dark"} onClick={() => setTheme("dark")}>
                {copy.themeDark}
              </SegmentButton>
              <SegmentButton active={theme === "light"} onClick={() => setTheme("light")}>
                {copy.themeLight}
              </SegmentButton>
              <SegmentButton active={theme === "paper"} onClick={() => setTheme("paper")}>
                {copy.themePaper}
              </SegmentButton>
            </div>
          </div>
          <Link
            href="/settings"
            onClick={() => setOpen(false)}
            className="nm-link-inline"
            style={{ justifySelf: "start" }}
          >
            {copy.openSettings}
          </Link>
        </div>
      ) : null}
    </div>
  );
}

function SegmentButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        border: "1px solid",
        borderColor: active ? "var(--fg-0)" : "var(--border)",
        background: active ? "var(--fg-0)" : "transparent",
        color: active ? "var(--bg-0)" : "var(--fg-1)",
        borderRadius: 8,
        padding: "8px 10px",
        cursor: "pointer",
        textAlign: "left",
      }}
    >
      {children}
    </button>
  );
}
