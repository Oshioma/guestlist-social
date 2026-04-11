"use client";

import Link from "next/link";
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

      {/* Quick actions */}
      <div style={{ width: 200, display: "flex", gap: 6, justifyContent: "flex-end" }}>
        {ad.campaignId && (
          <Link
            href={`/app/clients/${ad.clientId}/campaigns/${ad.campaignId}/ads/${ad.id}/edit`}
            style={{
              padding: "4px 10px",
              borderRadius: 6,
              border: "1px solid #e4e4e7",
              background: "#fff",
              fontSize: 12,
              color: "#18181b",
              textDecoration: "none",
              fontWeight: 500,
            }}
          >
            Edit
          </Link>
        )}
        {ad.status === "active" && (
          <button
            onClick={() => console.log("pause ad", ad.id)}
            style={{
              padding: "4px 10px",
              borderRadius: 6,
              border: "1px solid #e4e4e7",
              background: "#fff",
              fontSize: 12,
              color: "#854d0e",
              cursor: "pointer",
            }}
          >
            Pause
          </button>
        )}
        {ad.status === "paused" && (
          <button
            onClick={() => console.log("resume ad", ad.id)}
            style={{
              padding: "4px 10px",
              borderRadius: 6,
              border: "1px solid #e4e4e7",
              background: "#fff",
              fontSize: 12,
              color: "#166534",
              cursor: "pointer",
            }}
          >
            Resume
          </button>
        )}
        <button
          onClick={() => console.log("duplicate ad", ad.id)}
          style={{
            padding: "4px 10px",
            borderRadius: 6,
            border: "1px solid #e4e4e7",
            background: "#fff",
            fontSize: 12,
            color: "#52525b",
            cursor: "pointer",
          }}
        >
          Duplicate
        </button>
        {ad.status === "active" && ad.ctr >= 2.5 && (
          <button
            onClick={() => console.log("scale ad", ad.id)}
            style={{
              padding: "4px 10px",
              borderRadius: 6,
              border: "none",
              background: "#18181b",
              fontSize: 12,
              color: "#fff",
              cursor: "pointer",
            }}
          >
            Scale
          </button>
        )}
      </div>
    </div>
  );
}
