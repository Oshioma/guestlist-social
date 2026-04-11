"use client";

import { useState } from "react";
import type { Action } from "../lib/types";
import { formatDate } from "../lib/utils";

export default function ActionList({
  actions: initial,
}: {
  actions: Action[];
}) {
  const [doneIds, setDoneIds] = useState<Set<string>>(
    () => new Set(initial.filter((a) => a.done).map((a) => a.id))
  );

  function toggle(id: string) {
    setDoneIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const sorted = [...initial].sort((a, b) => {
    const aDone = doneIds.has(a.id) ? 1 : 0;
    const bDone = doneIds.has(b.id) ? 1 : 0;
    return aDone - bDone;
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {sorted.map((a) => {
        const done = doneIds.has(a.id);
        return (
          <div
            key={a.id}
            onClick={() => toggle(a.id)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "8px 0",
              borderBottom: "1px solid #f4f4f5",
              opacity: done ? 0.45 : 1,
              cursor: "pointer",
              transition: "opacity 0.2s",
            }}
          >
            <span
              style={{
                width: 18,
                height: 18,
                borderRadius: 4,
                border: done ? "2px solid #166534" : "2px solid #d4d4d8",
                background: done ? "#dcfce7" : "transparent",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 11,
                flexShrink: 0,
                transition: "all 0.15s",
              }}
            >
              {done && "✓"}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 14,
                  textDecoration: done ? "line-through" : "none",
                  transition: "text-decoration 0.15s",
                }}
              >
                {a.label}
              </div>
              <div style={{ fontSize: 12, color: "#a1a1aa" }}>
                {a.clientName} · {formatDate(a.due)}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
