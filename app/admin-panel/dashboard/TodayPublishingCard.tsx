"use client";

import { useState } from "react";

export type TodayAccountRow = {
  clientId: string;
  name: string;
  handle: string | null;
  scheduled: number;
  posted: number;
};

export type TodayPublishingStats = {
  scheduledToday: number;
  postedToday: number;
  zoneAbbrev: string;
  byAccount: TodayAccountRow[];
};

export default function TodayPublishingCard({
  stats,
}: {
  stats: TodayPublishingStats;
}) {
  const [open, setOpen] = useState(false);
  const hasBreakdown = stats.byAccount.length > 0;

  return (
    <div
      style={{
        borderRadius: 14,
        background: "#fff",
        border: "1px solid #e4e4e7",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "stretch",
          justifyContent: "space-between",
          gap: 12,
          padding: "16px 18px",
        }}
      >
        <div style={{ display: "flex", gap: 32 }}>
          <div>
            <div style={{ fontSize: 12, color: "#71717a", marginBottom: 6 }}>
              Scheduled today
            </div>
            <div
              style={{
                fontSize: 28,
                fontWeight: 700,
                color: "#18181b",
                letterSpacing: "-0.02em",
              }}
            >
              {stats.scheduledToday}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: "#71717a", marginBottom: 6 }}>
              Posted today
            </div>
            <div
              style={{
                fontSize: 28,
                fontWeight: 700,
                color: stats.postedToday > 0 ? "#166534" : "#18181b",
                letterSpacing: "-0.02em",
              }}
            >
              {stats.postedToday}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", justifyContent: "space-between" }}>
          <div style={{ fontSize: 11, color: "#a1a1aa" }}>
            {stats.zoneAbbrev ? `times in ${stats.zoneAbbrev}` : " "}
          </div>
          {hasBreakdown ? (
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              style={{
                background: "none",
                border: "none",
                padding: 0,
                cursor: "pointer",
                color: "#7c3aed",
                fontSize: 13,
                fontWeight: 600,
              }}
              aria-expanded={open}
            >
              {open ? "Hide breakdown ▴" : "View by account ▾"}
            </button>
          ) : (
            <span style={{ fontSize: 13, color: "#a1a1aa" }}>No activity today</span>
          )}
        </div>
      </div>

      {open && hasBreakdown && (
        <div style={{ borderTop: "1px solid #f4f4f5" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: 13,
            }}
          >
            <thead>
              <tr style={{ color: "#71717a", textAlign: "left" }}>
                <th style={{ padding: "8px 18px", fontWeight: 600 }}>Account</th>
                <th style={{ padding: "8px 12px", fontWeight: 600, textAlign: "right" }}>
                  Scheduled
                </th>
                <th style={{ padding: "8px 18px", fontWeight: 600, textAlign: "right" }}>
                  Posted
                </th>
              </tr>
            </thead>
            <tbody>
              {stats.byAccount.map((row) => (
                <tr key={row.clientId} style={{ borderTop: "1px solid #f4f4f5" }}>
                  <td style={{ padding: "8px 18px" }}>
                    <span style={{ fontWeight: 600, color: "#18181b" }}>{row.name}</span>
                    {row.handle ? (
                      <span style={{ color: "#a1a1aa", marginLeft: 6 }}>
                        @{row.handle.replace(/^@+/, "")}
                      </span>
                    ) : null}
                  </td>
                  <td style={{ padding: "8px 12px", textAlign: "right", color: "#18181b" }}>
                    {row.scheduled}
                  </td>
                  <td
                    style={{
                      padding: "8px 18px",
                      textAlign: "right",
                      color: row.posted > 0 ? "#166534" : "#18181b",
                      fontWeight: row.posted > 0 ? 600 : 400,
                    }}
                  >
                    {row.posted}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
