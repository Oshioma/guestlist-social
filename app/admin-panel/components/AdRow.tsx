import type { Ad } from "../lib/types";
import StatusPill from "./StatusPill";
import { formatCurrency } from "../lib/utils";

export default function AdRow({ ad }: { ad: Ad }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        padding: "10px 0",
        borderBottom: "1px solid #f4f4f5",
        gap: 12,
        fontSize: 14,
      }}
    >
      <div style={{ flex: 2, fontWeight: 500 }}>{ad.name}</div>
      <div style={{ flex: 1, color: "#71717a" }}>{ad.platform}</div>
      <div style={{ width: 90 }}>
        <StatusPill status={ad.status} />
      </div>
      <div style={{ width: 80, textAlign: "right", color: "#52525b" }}>
        {formatCurrency(ad.spend)}
      </div>
      <div style={{ width: 90, textAlign: "right", color: "#52525b" }}>
        {ad.impressions.toLocaleString()}
      </div>
      <div style={{ width: 60, textAlign: "right", color: "#52525b" }}>
        {ad.clicks.toLocaleString()}
      </div>
      <div style={{ width: 60, textAlign: "right", fontWeight: 500 }}>
        {ad.ctr > 0 ? `${ad.ctr}%` : "—"}
      </div>
    </div>
  );
}
