"use client";

import { useEffect, useState } from "react";
import { Skeleton } from "@/app/ui/skeleton";

type HealthRow = {
  id: string;
  name: string;
  kind: string;
  enabled: boolean;
  fetchIntervalSec: number;
  lastRunAt: string | null;
  lastOkAt: string | null;
  lastError: string | null;
  failCount: number;
};

function fmt(raw: string | null) {
  if (!raw) return "-";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("zh-CN", { hour12: false });
}

export default function HealthPage() {
  const [rows, setRows] = useState<HealthRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [bootstrapped, setBootstrapped] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/health");
      setRows((await res.json()) as HealthRow[]);
    } finally {
      setLoading(false);
      setBootstrapped(true);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function runNow(id: string) {
    await fetch(`/api/sources/${id}`, { method: "POST" });
    await load();
  }

  return (
    <div>
      <header style={{ display: "flex", alignItems: "baseline", marginBottom: 16 }}>
        <h1 className="nm-title">信源健康</h1>
        <span style={{ marginLeft: 12, color: "#5b6478", fontSize: 12 }}>
          M5：状态与立即抓取
        </span>
      </header>
      {!bootstrapped && loading ? (
        <div className="nm-table-wrap" aria-busy="true" aria-label="加载中">
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={thtdStyle}>名称</th>
                <th style={thtdStyle}>类型</th>
                <th style={thtdStyle}>上次成功</th>
                <th style={thtdStyle}>失败次数</th>
                <th style={thtdStyle}>错误</th>
                <th style={thtdStyle}>操作</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 8 }).map((_, i) => (
                <tr key={i}>
                  <td style={thtdStyle}>
                    <Skeleton style={{ height: 14, width: `${40 + (i % 4) * 10}%` }} />
                  </td>
                  <td style={thtdStyle}>
                    <Skeleton style={{ height: 14, width: 72 }} />
                  </td>
                  <td style={thtdStyle}>
                    <Skeleton style={{ height: 14, width: 120 }} />
                  </td>
                  <td style={thtdStyle}>
                    <Skeleton style={{ height: 14, width: 28 }} />
                  </td>
                  <td style={thtdStyle}>
                    <Skeleton style={{ height: 14, width: "min(200px, 80%)" }} />
                  </td>
                  <td style={thtdStyle}>
                    <Skeleton style={{ height: 32, width: 96 }} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="nm-table-wrap">
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={thtdStyle}>名称</th>
                <th style={thtdStyle}>类型</th>
                <th style={thtdStyle}>上次成功</th>
                <th style={thtdStyle}>失败次数</th>
                <th style={thtdStyle}>错误</th>
                <th style={thtdStyle}>操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td style={thtdStyle}>{row.name}</td>
                  <td style={thtdStyle}>{row.kind}</td>
                  <td style={thtdStyle}>{fmt(row.lastOkAt)}</td>
                  <td style={thtdStyle}>{row.failCount}</td>
                  <td style={thtdStyle}>{row.lastError ? row.lastError.slice(0, 80) : "-"}</td>
                  <td style={thtdStyle}>
                    <button style={btnStyle} onClick={() => void runNow(row.id)}>
                      立即抓一次
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const thtdStyle: React.CSSProperties = {
  textAlign: "left",
  borderBottom: "1px solid #20283a",
  padding: "10px 8px",
  fontSize: 13,
};

const btnStyle: React.CSSProperties = {
  border: "1px solid #2f4573",
  borderRadius: 6,
  padding: "6px 10px",
  background: "transparent",
  color: "#95b4ff",
  cursor: "pointer",
};
