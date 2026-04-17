import Link from "next/link";
import { SessionProvider } from "@/components/session-provider";
import { LogoutButton } from "@/components/logout-button";

const NAV: Array<{ href: string; label: string; group?: string }> = [
  { href: "/", label: "精选", group: "时间轴" },
  { href: "/all", label: "全部 AI 动态", group: "时间轴" },
  { href: "/favorites", label: "收藏", group: "时间轴" },
  { href: "/sources", label: "信源", group: "运营" },
  { href: "/health", label: "信源健康", group: "运营" },
  { href: "/keywords", label: "关键词", group: "运营" },
  { href: "/stats", label: "统计", group: "系统" },
  { href: "/system", label: "系统", group: "系统" },
];

export default function DashLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const groups = Array.from(new Set(NAV.map((n) => n.group).filter(Boolean))) as string[];
  return (
    <SessionProvider>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "220px 1fr",
          minHeight: "100vh",
        }}
      >
        <aside
          style={{
            background: "#10131c",
            borderRight: "1px solid #1f2330",
            padding: "20px 0",
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          <div
            style={{
              padding: "0 20px",
              fontSize: 18,
              fontWeight: 600,
              color: "#fff",
            }}
          >
            news-monitor
          </div>
          <nav style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {groups.map((g) => (
              <div key={g}>
                <div
                  style={{
                    padding: "0 20px 4px",
                    fontSize: 11,
                    letterSpacing: 1,
                    color: "#5b6478",
                    textTransform: "uppercase",
                  }}
                >
                  {g}
                </div>
                {NAV.filter((n) => n.group === g).map((n) => (
                  <Link
                    key={n.href}
                    href={n.href}
                    style={{
                      display: "block",
                      padding: "6px 20px",
                      color: "#cdd2dc",
                    }}
                  >
                    {n.label}
                  </Link>
                ))}
              </div>
            ))}
          </nav>
          <div style={{ marginTop: "auto", padding: "0 20px" }}>
            <LogoutButton />
          </div>
        </aside>
        <main style={{ padding: 20, overflow: "auto" }}>{children}</main>
      </div>
    </SessionProvider>
  );
}
