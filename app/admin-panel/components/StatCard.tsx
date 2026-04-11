import type { Stat } from "../lib/types";

export default function StatCard({ stat }: { stat: Stat }) {
  const trendColor =
    stat.trend === "up"
      ? "#166534"
      : stat.trend === "down"
        ? "#991b1b"
        : "#71717a";

  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e4e4e7",
        borderRadius: 12,
        padding: 20,
      }}
    >
      <div style={{ fontSize: 13, color: "#71717a", marginBottom: 4 }}>
        {stat.label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 700 }}>{stat.value}</div>
      {stat.change && (
        <div style={{ fontSize: 13, color: trendColor, marginTop: 4 }}>
          {stat.change}
        </div>
      )}
    </div>
  );
}
