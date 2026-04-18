"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { Button } from "@/app/ui/button";
import { Card } from "@/app/ui/card";
import { Input } from "@/app/ui/input";
import { Skeleton } from "@/app/ui/skeleton";
import { Switch } from "@/app/ui/switch";

type KeywordRule = {
  id: string;
  pattern: string;
  isRegex: boolean;
  notify: boolean;
};

export default function KeywordsPage() {
  const [rows, setRows] = useState<KeywordRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [bootstrapped, setBootstrapped] = useState(false);
  const [pattern, setPattern] = useState("");
  const [isRegex, setIsRegex] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/keywords");
      setRows((await res.json()) as KeywordRule[]);
    } finally {
      setLoading(false);
      setBootstrapped(true);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function addRule() {
    if (!pattern.trim()) return;
    await fetch("/api/keywords", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pattern: pattern.trim(), isRegex, notify: true }),
    });
    setPattern("");
    setIsRegex(false);
    await load();
  }

  async function removeRule(id: string) {
    await fetch(`/api/keywords/${id}`, { method: "DELETE" });
    await load();
  }

  return (
    <div>
      <header style={{ display: "flex", alignItems: "baseline", marginBottom: 16, gap: 8, flexWrap: "wrap" }}>
        <h1 className="nm-title">关键词与通知</h1>
        <span className="nm-muted">M5：命中后桌面通知</span>
      </header>

      <Card style={{ marginBottom: 16, padding: 16 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end" }}>
          <label className="nm-label" style={{ flex: "1 1 280px", minWidth: 0 }}>
            关键词
            <Input
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
              placeholder="例如 Claude / OpenAI / agent"
            />
          </label>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              color: "var(--fg-2)",
              fontSize: 13,
              paddingBottom: 4,
            }}
          >
            <Switch checked={isRegex} onChange={setIsRegex} />
            正则匹配
          </label>
          <Button type="button" variant="primary" onClick={() => void addRule()}>
            新增规则
          </Button>
        </div>
      </Card>

      {!bootstrapped && loading ? (
        <Card style={{ padding: 0, overflow: "hidden" }}>
          <div className="nm-table-wrap">
            <table className="nm-table">
              <thead>
                <tr>
                  <th>
                    <Skeleton style={{ height: 12, width: 120 }} />
                  </th>
                  <th>
                    <Skeleton style={{ height: 12, width: 48 }} />
                  </th>
                  <th>
                    <Skeleton style={{ height: 12, width: 40 }} />
                  </th>
                  <th style={{ width: 100 }}>
                    <Skeleton style={{ height: 12, width: 36 }} />
                  </th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    <td>
                      <Skeleton style={{ height: 14, width: `${55 + (i % 3) * 12}%` }} />
                    </td>
                    <td>
                      <Skeleton style={{ height: 14, width: 56 }} />
                    </td>
                    <td>
                      <Skeleton style={{ height: 14, width: 40 }} />
                    </td>
                    <td>
                      <Skeleton style={{ height: 32, width: 56 }} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : rows.length === 0 ? (
        <div className="nm-empty-state">
          暂无关键词规则
        </div>
      ) : (
        <Card style={{ padding: 0, overflow: "hidden" }}>
          <div className="nm-table-wrap">
            <table className="nm-table">
            <thead>
              <tr>
                <th>Pattern</th>
                <th>类型</th>
                <th>通知</th>
                <th style={{ width: 100 }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <motion.tr
                  key={row.id}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i * 0.03, 0.3) }}
                >
                  <td>{row.pattern}</td>
                  <td>{row.isRegex ? "Regex" : "关键词"}</td>
                  <td>{row.notify ? "开启" : "关闭"}</td>
                  <td>
                    <Button type="button" variant="danger" onClick={() => void removeRule(row.id)}>
                      删除
                    </Button>
                  </td>
                </motion.tr>
              ))}
            </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
