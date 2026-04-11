"use client";

import Link from "next/link";
import type { Ad } from "../lib/types";
import { formatCurrency } from "../lib/utils";
import { getActionSuggestion } from "../lib/action-engine";

const perfColors: Record<string, { bg: string; text: string }> = {
  winner: { bg: "#dcfce7", text: "#166534" },
  losing: { bg: "#fee2e2", text: "#991b1b" },
  testing: { bg: "#fef3c7", text: "#92400e" },
  paused: { bg: "#f4f4f5", text: "#71717a" },
};

const priorityColors: Record<string, { bg: string; text: string }> = {
  high: { bg: "#fee2e2", text: "#991b1b" },
  medium: { bg: "#fef3c7", text: "#92400e" },
  low: { bg: "#f4f4f5", text: "#71717a" },
};

export default function AdRow({ ad }: { ad: Ad }) {
  const colors = perfColors[ad.performanceStatus] ?? perfColors.testing;
  const suggestion = getActionSuggestion({
    performance_status: ad.performanceStatus,
    performance_reason: ad.performanceReason,
  });

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        padding: "12px 0",
        borderBottom: "1px solid #f4f4f5",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          fontSize: 14,
        }}
      >
        <div style={{ flex: 2, fontWeight: 500 }}>{ad.name}</div>
        <div style={{ width: 100 }}>
          <span
            style={{
              display: "inline-block",
              padding: "2px 10px",
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 600,
              background: colors.bg,
              color: colors.text,
              textTransform: "capitalize",
            }}
          >
            {ad.performanceStatus}
          </span>
        </div>
        <div
          style={{
            width: 50,
            textAlign: "center",
            fontSize: 13,
            fontWeight: 700,
            color: ad.performanceScore >= 3 ? "#166534" : ad.performanceScore <= -2 ? "#991b1b" : "#71717a",
          }}
        >
          {ad.performanceScore > 0 ? `+${ad.performanceScore}` : ad.performanceScore}
        </div>
        <div style={{ width: 80, textAlign: "right", color: "#52525b", fontSize: 13 }}>
          {formatCurrency(ad.spend)}
        </div>
        <div style={{ width: 90, textAlign: "right", color: "#52525b", fontSize: 13 }}>
          {ad.impressions.toLocaleString()}
        </div>
        <div style={{ width: 60, textAlign: "right", color: "#52525b", fontSize: 13 }}>
          {ad.clicks.toLocaleString()}
        </div>
        <div style={{ width: 60, textAlign: "right", fontWeight: 500, fontSize: 13 }}>
          {ad.ctr > 0 ? `${ad.ctr}%` : "—"}
        </div>
        <div style={{ width: 50, textAlign: "right", color: "#52525b", fontSize: 13 }}>
          {ad.conversions > 0 ? ad.conversions : "—"}
        </div>

        <div style={{ width: 120, display: "flex", gap: 6, justifyContent: "flex-end" }}>
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
        </div>
      </div>

      <div style={{ fontSize: 12, color: "#71717a", paddingLeft: 2 }}>
        {ad.performanceReason}
      </div>

      {suggestion && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginTop: 2,
            paddingLeft: 2,
            fontSize: 12,
          }}
        >
          <span style={{ color: "#991b1b" }}>Problem: {suggestion.problem}</span>
          <span style={{ color: "#18181b" }}>Action: {suggestion.action}</span>
          <span
            style={{
              padding: "1px 8px",
              borderRadius: 999,
              fontSize: 11,
              fontWeight: 600,
              background: priorityColors[suggestion.priority].bg,
              color: priorityColors[suggestion.priority].text,
              textTransform: "uppercase",
            }}
          >
            {suggestion.priority}
          </span>
        </div>
      )}
    </div>
  );
}
