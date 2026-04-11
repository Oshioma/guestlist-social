import type { Action } from "../lib/types";
import { formatDate } from "../lib/utils";

export default function ActionList({ actions }: { actions: Action[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {actions.map((a) => (
        <div
          key={a.id}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "8px 0",
            borderBottom: "1px solid #f4f4f5",
            opacity: a.done ? 0.5 : 1,
          }}
        >
          <span
            style={{
              width: 18,
              height: 18,
              borderRadius: 4,
              border: a.done
                ? "2px solid #166534"
                : "2px solid #d4d4d8",
              background: a.done ? "#dcfce7" : "transparent",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 11,
              flexShrink: 0,
            }}
          >
            {a.done && "✓"}
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 14,
                textDecoration: a.done ? "line-through" : "none",
              }}
            >
              {a.label}
            </div>
            <div style={{ fontSize: 12, color: "#a1a1aa" }}>
              {a.clientName} · {formatDate(a.due)}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
