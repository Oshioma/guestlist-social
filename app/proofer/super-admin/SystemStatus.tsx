import type { StatusGroup, CheckStatus } from "@/lib/admin/system-status";

// Server-rendered read-out of the system status groups. No secrets — the loader
// only ever hands us display-safe values.
export default function SystemStatus({ groups }: { groups: StatusGroup[] }) {
  if (groups.length === 0) {
    return <p style={{ fontSize: 14, color: "#71717a" }}>Nothing to show.</p>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 12, color: "#71717a" }}>
        <Legend status="ok" label="OK" />
        <Legend status="warn" label="Optional / not set" />
        <Legend status="missing" label="Missing / failing" />
      </div>

      {groups.map((g) => (
        <div key={g.name} style={cardStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <Dot status={g.status} />
            <span style={{ fontSize: 14.5, fontWeight: 700, color: "#27272a" }}>{g.name}</span>
          </div>
          {g.description && (
            <p style={{ fontSize: 12.5, color: "#71717a", margin: "4px 0 0" }}>{g.description}</p>
          )}
          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
            {g.checks.map((c, i) => (
              <div key={i} style={rowStyle}>
                <span style={{ display: "flex", alignItems: "center", gap: 8, flex: "1 1 240px", minWidth: 0 }}>
                  <Dot status={c.status} />
                  <span style={{ fontSize: 13, color: "#3f3f46" }}>{c.label}</span>
                </span>
                <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", minWidth: 0, flex: "1 1 200px" }}>
                  <code style={{ ...valueStyle, color: valueColor(c.status) }}>{c.value}</code>
                  {c.hint && <span style={{ fontSize: 11, color: "#a1a1aa" }}>{c.hint}</span>}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function Legend({ status, label }: { status: CheckStatus; label: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <Dot status={status} />
      {label}
    </span>
  );
}

function Dot({ status }: { status: CheckStatus }) {
  const bg = status === "ok" ? "#22c55e" : status === "warn" ? "#f59e0b" : "#ef4444";
  return (
    <span
      aria-hidden
      style={{ width: 9, height: 9, borderRadius: 999, background: bg, flex: "0 0 auto", display: "inline-block" }}
    />
  );
}

function valueColor(status: CheckStatus): string {
  return status === "missing" ? "#b91c1c" : status === "warn" ? "#92600a" : "#3f3f46";
}

const cardStyle: React.CSSProperties = {
  border: "1px solid #e4e4e7",
  borderRadius: 12,
  padding: 14,
  background: "#fff",
};

const rowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  padding: "8px 10px",
  border: "1px solid #f0f0f2",
  borderRadius: 9,
  background: "#fafafa",
  flexWrap: "wrap",
};

const valueStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  wordBreak: "break-all",
  textAlign: "right",
};
