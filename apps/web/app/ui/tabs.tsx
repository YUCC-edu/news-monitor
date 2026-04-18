"use client";

import { motion } from "framer-motion";
import { cn } from "./cn";

type Tab = { id: string; label: string };

export function Tabs({
  tabs,
  value,
  onChange,
}: {
  tabs: Tab[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="nm-tabs">
      {tabs.map((t) => {
        const active = t.id === value;
        return (
          <button
            key={t.id}
            type="button"
            className={cn("nm-tab", active && "nm-tab--active")}
            onClick={() => onChange(t.id)}
          >
            {t.label}
            {active ? (
              <motion.div
                layoutId="nm-tab-line"
                className="nm-tab-line"
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  bottom: -1,
                  height: 2,
                  background: "var(--fg-0)",
                  borderRadius: 1,
                }}
                transition={{ type: "spring", stiffness: 420, damping: 32 }}
              />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
