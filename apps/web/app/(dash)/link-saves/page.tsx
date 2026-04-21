"use client";

import { useCallback, useEffect, useState } from "react";

type Row = {
  id: string;
  url: string;
  note: string | null;
  createdAt: string;
};

export default function LinkSavesPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/user-links");
      setRows((await res.json()) as Row[]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/user-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim(), note: note.trim() || null }),
      });
      if (!res.ok) return;
      setUrl("");
      setNote("");
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    await fetch(`/api/user-links/${id}`, { method: "DELETE" });
    await load();
  }

  return (
    <div>
      <header style={{ marginBottom: 16 }}>
        <h1 className="nm-title">链接收藏</h1>
        <p className="nm-muted" style={{ fontSize: 13, marginTop: 8, maxWidth: 560 }}>
          与「时间轴 · 收藏」中的<strong>条目收藏</strong>不同：此处仅保存任意 URL
          + 备注，用于无法转成 RSS 监控的链接备忘。
        </p>
      </header>

      <form
        onSubmit={(e) => void add(e)}
        style={{
          display: "grid",
          gap: 10,
          maxWidth: 520,
          marginBottom: 24,
          padding: 14,
          border: "1px solid var(--border)",
          borderRadius: 10,
          background: "var(--bg-1)",
        }}
      >
        <label style={{ fontSize: 12, color: "var(--fg-2)" }}>
          URL
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://..."
            style={inputStyle}
          />
        </label>
        <label style={{ fontSize: 12, color: "var(--fg-2)" }}>
          备注（可选）
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            style={inputStyle}
          />
        </label>
        <button type="submit" disabled={saving || !url.trim()} style={btnPrimary}>
          {saving ? "保存中…" : "添加链接"}
        </button>
      </form>

      {loading ? (
        <div className="nm-muted">加载中…</div>
      ) : rows.length === 0 ? (
        <div className="nm-empty-state">暂无链接收藏</div>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 10 }}>
          {rows.map((r) => (
            <li
              key={r.id}
              style={{
                border: "1px solid var(--border)",
                borderRadius: 10,
                padding: 12,
                display: "flex",
                flexWrap: "wrap",
                gap: 10,
                alignItems: "center",
              }}
            >
              <a href={r.url} target="_blank" rel="noreferrer" style={{ color: "#95b4ff", flex: 1 }}>
                {r.url}
              </a>
              {r.note ? (
                <span className="nm-muted" style={{ fontSize: 13 }}>
                  {r.note}
                </span>
              ) : null}
              <span className="nm-muted" style={{ fontSize: 11 }}>
                {new Date(r.createdAt).toLocaleString("zh-CN", { hour12: false })}
              </span>
              <button type="button" onClick={() => void remove(r.id)} style={btnGhost}>
                删除
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  marginTop: 4,
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "var(--bg-0)",
  color: "var(--fg-0)",
};

const btnPrimary: React.CSSProperties = {
  padding: "8px 14px",
  borderRadius: 8,
  border: "1px solid #2f4573",
  background: "#1c2a4a",
  color: "#dbeafe",
  cursor: "pointer",
};

const btnGhost: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "transparent",
  color: "var(--fg-2)",
  cursor: "pointer",
};
