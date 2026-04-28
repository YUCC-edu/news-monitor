"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type TrendPoint = {
  day: string;
  dayLabel: string;
  items: number;
  activeSources: number;
  clusters: number;
  hotspotIndex: number;
};

export function TrendChart({ data }: { data: TrendPoint[] }) {
  return (
    <div style={{ width: "100%", height: 280 }}>
      <ResponsiveContainer>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="dayLabel" tick={{ fill: "var(--fg-2)", fontSize: 12 }} />
          <YAxis tick={{ fill: "var(--fg-2)", fontSize: 12 }} />
          <Tooltip
            contentStyle={{
              background: "var(--bg-1)",
              border: "1px solid var(--border)",
              color: "var(--fg-0)",
            }}
          />
          <Line
            type="monotone"
            dataKey="hotspotIndex"
            name="关注指数"
            stroke="var(--fg-0)"
            strokeWidth={3}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="clusters"
            name="事件数"
            stroke="#bbbbbb"
            strokeWidth={2}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="items"
            name="条目数"
            stroke="#8f8f8f"
            strokeWidth={2}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="activeSources"
            name="活跃信源"
            stroke="#5f5f5f"
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
