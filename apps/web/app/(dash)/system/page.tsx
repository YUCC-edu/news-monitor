"use client";

import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { Skeleton } from "@/app/ui/skeleton";

type QueueCounts = {
  waiting?: number;
  active?: number;
  completed?: number;
  failed?: number;
  delayed?: number;
  paused?: number;
} | null;

type SystemData = {
  env: {
    database: { url: string | null; set: boolean };
    redis: { url: string | null; set: boolean; ok: boolean };
    rsshub: { url: string | null; set: boolean; ok: boolean };
    wewe: { url: string | null; set: boolean; ok: boolean };
    llm: {
      baseUrl: string | null;
      chatModel: string | null;
      embeddingModel: string | null;
      hasKey: boolean;
    };
  };
  queues: Record<string, QueueCounts>;
  backups: Array<{ name: string; sizeKB: number; mtime: string }>;
  node: { version: string; platform: string; uptimeSec: number };
};

function dot(ok: boolean | undefined, label?: string) {
  const color = ok ? "#2ba245" : ok === false ? "#ef4444" : "#5b6478";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: color,
          display: "inline-block",
        }}
      />
      {label ?? (ok ? "OK" : ok === false ? "FAIL" : "—")}
    </span>
  );
}

export default function SystemPage() {
  const [data, setData] = useState<SystemData | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const d = (await fetch("/api/system").then((r) => r.json())) as SystemData;
      setData(d);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 15000);
    return () => clearInterval(t);
  }, []);

  return (
    <div>
      <header style={{ display: "flex", alignItems: "baseline", marginBottom: 16 }}>
        <h1 className="nm-title">系统</h1>
        <span style={{ marginLeft: 12, color: "#5b6478", fontSize: 12 }}>
          环境配置 / 队列状态 / 备份（每 15s 刷新）
        </span>
        <button style={{ ...ghostBtn, marginLeft: "auto" }} onClick={() => void load()}>
          立即刷新
        </button>
      </header>

      {loading && !data ? (
        <div aria-busy="true" aria-label="加载中">
          <section style={{ ...cardStyle, marginBottom: 12 }}>
            <Skeleton style={{ height: 16, width: 120, marginBottom: 10 }} />
            <div className="nm-table-wrap">
              <table style={tableStyle}>
                <tbody>
                  {Array.from({ length: 7 }).map((_, i) => (
                    <tr key={i}>
                      <td style={tdLabel}>
                        <Skeleton style={{ height: 12, width: "88%" }} />
                      </td>
                      <td style={tdValue}>
                        <Skeleton style={{ height: 12, width: i % 2 ? "70%" : "92%" }} />
                      </td>
                      <td style={tdStatus}>
                        <Skeleton style={{ height: 12, width: 36, marginLeft: "auto" }} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section style={{ ...cardStyle, marginBottom: 12 }}>
            <Skeleton style={{ height: 16, width: 96, marginBottom: 10 }} />
            <div className="nm-table-wrap">
              <table style={tableStyle}>
                <thead>
                  <tr>
                    {Array.from({ length: 6 }).map((_, j) => (
                      <th key={j} style={thStyle}>
                        <Skeleton style={{ height: 10, width: j === 0 ? 56 : 44 }} />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 6 }).map((_, j) => (
                        <td key={j} style={j === 0 ? tdLabel : tdValue}>
                          <Skeleton style={{ height: 12, width: j === 0 ? "80%" : "50%" }} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section style={cardStyle}>
            <Skeleton style={{ height: 16, width: 100, marginBottom: 10 }} />
            <Skeleton style={{ height: 14, width: "min(420px, 100%)" }} />
          </section>
        </div>
      ) : !data ? (
        <div className="nm-empty-state">加载失败</div>
      ) : (
        <>
          <section style={{ ...cardStyle, marginBottom: 16 }}>
            <h2 style={sectionTitle}>环境配置</h2>
            <div className="nm-table-wrap">
              <table style={tableStyle}>
                <tbody>
                <tr>
                  <td style={tdLabel}>DATABASE_URL</td>
                  <td style={tdValue}>
                    {data.env.database.url ?? <span style={muted}>未配置</span>}
                  </td>
                  <td style={tdStatus}>{dot(data.env.database.set)}</td>
                </tr>
                <tr>
                  <td style={tdLabel}>REDIS_URL</td>
                  <td style={tdValue}>
                    {data.env.redis.url ?? <span style={muted}>未配置</span>}
                  </td>
                  <td style={tdStatus}>{dot(data.env.redis.ok)}</td>
                </tr>
                <tr>
                  <td style={tdLabel}>RSSHUB_BASE</td>
                  <td style={tdValue}>
                    {data.env.rsshub.url ?? <span style={muted}>未配置</span>}
                  </td>
                  <td style={tdStatus}>{dot(data.env.rsshub.ok)}</td>
                </tr>
                <tr>
                  <td style={tdLabel}>WEWE_RSS_BASE</td>
                  <td style={tdValue}>
                    {data.env.wewe.url ?? <span style={muted}>未配置（不订阅公众号可留空）</span>}
                  </td>
                  <td style={tdStatus}>{dot(data.env.wewe.ok)}</td>
                </tr>
                <tr>
                  <td style={tdLabel}>LLM_BASE_URL</td>
                  <td style={tdValue}>
                    {data.env.llm.baseUrl ?? <span style={muted}>未配置</span>}
                  </td>
                  <td style={tdStatus}>{dot(!!data.env.llm.baseUrl)}</td>
                </tr>
                <tr>
                  <td style={tdLabel}>LLM_API_KEY</td>
                  <td style={tdValue}>
                    {data.env.llm.hasKey ? (
                      <span style={{ color: "#cdd2dc" }}>已配置</span>
                    ) : (
                      <span style={muted}>未配置（无法翻译/打标签/聚类命名）</span>
                    )}
                  </td>
                  <td style={tdStatus}>{dot(data.env.llm.hasKey)}</td>
                </tr>
                <tr>
                  <td style={tdLabel}>Chat / Embedding</td>
                  <td style={tdValue}>
                    {data.env.llm.chatModel ?? "—"} / {data.env.llm.embeddingModel ?? "—"}
                  </td>
                  <td style={tdStatus} />
                </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section style={{ ...cardStyle, marginBottom: 16 }}>
            <h2 style={sectionTitle}>队列状态</h2>
            <div className="nm-table-wrap">
              <table style={tableStyle}>
                <thead>
                <tr>
                  <th style={thStyle}>队列</th>
                  <th style={thStyle}>waiting</th>
                  <th style={thStyle}>active</th>
                  <th style={thStyle}>delayed</th>
                  <th style={thStyle}>completed</th>
                  <th style={thStyle}>failed</th>
                </tr>
                </thead>
                <tbody>
                {Object.entries(data.queues).map(([name, c]) => (
                  <tr key={name}>
                    <td style={tdLabel}>{name}</td>
                    <td style={tdValue}>{c?.waiting ?? "—"}</td>
                    <td style={tdValue}>{c?.active ?? "—"}</td>
                    <td style={tdValue}>{c?.delayed ?? "—"}</td>
                    <td style={tdValue}>{c?.completed ?? "—"}</td>
                    <td style={{ ...tdValue, color: (c?.failed ?? 0) > 0 ? "#ff8f8f" : "#cdd2dc" }}>
                      {c?.failed ?? "—"}
                    </td>
                  </tr>
                ))}
                </tbody>
              </table>
            </div>
          </section>

          <section style={{ ...cardStyle, marginBottom: 16 }}>
            <h2 style={sectionTitle}>最近备份</h2>
            {data.backups.length === 0 ? (
              <div style={{ color: "#5b6478", fontSize: 13 }}>
                暂无备份。Windows 下运行 <code>docker/cron-pgdump.ps1</code> 或自行 pg_dump。
              </div>
            ) : (
              <ul style={{ margin: 0, paddingLeft: 18, color: "#cdd2dc", fontSize: 13 }}>
                {data.backups.map((b) => (
                  <li key={b.name}>
                    {b.name}
                    <span style={{ color: "#73809b", marginLeft: 8 }}>
                      {b.sizeKB} KB · {new Date(b.mtime).toLocaleString("zh-CN")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section style={cardStyle}>
            <h2 style={sectionTitle}>运行时</h2>
            <div style={{ color: "#cdd2dc", fontSize: 13 }}>
              Node {data.node.version} · {data.node.platform} · 已运行{" "}
              {Math.floor(data.node.uptimeSec / 60)} 分钟
            </div>
          </section>
        </>
      )}
    </div>
  );
}

const cardStyle: CSSProperties = {
  background: "#0f1522",
  border: "1px solid #252c3d",
  borderRadius: 10,
  padding: 12,
};

const sectionTitle: CSSProperties = {
  margin: "0 0 10px",
  fontSize: 13,
  fontWeight: 600,
  color: "#cdd2dc",
};

const tableStyle: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
};

const tdLabel: CSSProperties = {
  padding: "7px 8px",
  borderBottom: "1px solid #1d2333",
  color: "#8fa1c3",
  fontSize: 12,
  width: 148,
  verticalAlign: "middle",
};

const tdValue: CSSProperties = {
  padding: "7px 8px",
  borderBottom: "1px solid #1d2333",
  color: "#cdd2dc",
  fontSize: 12,
  verticalAlign: "middle",
};

const tdStatus: CSSProperties = {
  padding: "7px 8px",
  borderBottom: "1px solid #1d2333",
  fontSize: 12,
  width: 72,
  color: "#cdd2dc",
  verticalAlign: "middle",
};

const thStyle: CSSProperties = {
  textAlign: "left",
  padding: "7px 8px",
  borderBottom: "1px solid #20283a",
  color: "#73809b",
  fontSize: 11,
  fontWeight: 600,
};

const muted: CSSProperties = {
  color: "#5b6478",
};

const ghostBtn: CSSProperties = {
  border: "1px solid #2a2f3d",
  borderRadius: 6,
  padding: "6px 12px",
  background: "transparent",
  color: "#cdd2dc",
  cursor: "pointer",
  fontSize: 12,
};
