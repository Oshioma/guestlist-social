"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AdCreativeThumb from "@/app/admin-panel/components/AdCreativeThumb";

type DecisionItem = {
  id: number;
  adId: number | null;
  clientId: number | null;
  adName: string | null;
  decisionType: string;
  status: string;
  confidence: string | null;
  reason: string | null;
  action: string | null;
  createdAt: string;
  metaAction: string | null;
  creativeImageUrl: string | null;
  creativeVideoUrl: string | null;
};

type QueueItem = {
  id: number;
  adId: number | null;
  clientId: number | null;
  adName: string | null;
  decisionType: string;
  status: string;
  reason: string | null;
  riskLevel: string | null;
  createdAt: string;
  executedAt: string | null;
  executionError: string | null;
  creativeImageUrl: string | null;
  creativeVideoUrl: string | null;
};

type OutcomeItem = {
  id: number;
  queueId: number;
  adId: number | null;
  clientId: number | null;
  adName: string | null;
  decisionType: string;
  status: string;
  verdict: string | null;
  verdictReason: string | null;
  ctrLiftPct: number | null;
  measuredAt: string | null;
  createdAt: string;
  creativeImageUrl: string | null;
  creativeVideoUrl: string | null;
};

export type EngineDecisionWorkbenchData = {
  decisions: DecisionItem[];
  queue: QueueItem[];
  outcomes: OutcomeItem[];
};

type Tab = "decisions" | "queue" | "outcomes";

type DrawerItem = {
  id: string;
  title: string;
  subtitle: string;
  status: string;
  reason: string | null;
  action: string | null;
  confidence: string | null;
  timestampLabel: string;
  timestampValue: string;
  detailRows: Array<{ label: string; value: string }>;
  adId: number | null;
  clientId: number | null;
  adName: string | null;
  creativeImageUrl: string | null;
  creativeVideoUrl: string | null;
  sourceHref: string;
};

const TAB_LABELS: Record<Tab, string> = {
  decisions: "Decisions",
  queue: "Queue",
  outcomes: "Outcomes",
};

const DECISION_LABELS: Record<string, string> = {
  pause_ad: "Pause ad",
  increase_adset_budget: "Increase budget",
  decrease_adset_budget: "Decrease budget",
  duplicate_ad: "Duplicate ad",
  scale_budget: "Scale budget",
  pause_or_replace: "Pause / replace",
  kill_test: "Kill test",
  apply_known_fix: "Apply known fix",
  apply_winning_pattern: "Apply winning pattern",
};

function prettyLabel(value: string | null | undefined): string {
  if (!value) return "Unknown";
  return DECISION_LABELS[value] ?? value.replaceAll("_", " ");
}

function formatDate(iso: string | null): string {
  if (!iso) return "Unknown";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Unknown";
  return d.toLocaleString();
}

function toneForStatus(status: string): { bg: string; fg: string; border: string } {
  if (status === "pending" || status === "awaiting_followup") {
    return { bg: "#fef3c7", fg: "#92400e", border: "#fcd34d" };
  }
  if (status === "approved" || status === "executed" || status === "measured") {
    return { bg: "#dcfce7", fg: "#166534", border: "#86efac" };
  }
  if (status === "failed" || status === "rejected" || status === "negative") {
    return { bg: "#fee2e2", fg: "#991b1b", border: "#fca5a5" };
  }
  return { bg: "#f4f4f5", fg: "#52525b", border: "#d4d4d8" };
}

export default function EngineDecisionWorkbench({
  data,
}: {
  data: EngineDecisionWorkbenchData;
}) {
  const [activeTab, setActiveTab] = useState<Tab>("decisions");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const items = useMemo<DrawerItem[]>(() => {
    if (activeTab === "decisions") {
      return data.decisions.map((item) => ({
        id: `decision-${item.id}`,
        title: prettyLabel(item.decisionType),
        subtitle: item.adName ?? "Unknown ad",
        status: item.status,
        reason: item.reason,
        action: item.action,
        confidence: item.confidence,
        timestampLabel: "Created",
        timestampValue: item.createdAt,
        detailRows: [
          { label: "Decision ID", value: String(item.id) },
          { label: "Type", value: prettyLabel(item.decisionType) },
          { label: "Confidence", value: item.confidence ?? "Unknown" },
          { label: "Meta action", value: item.metaAction ?? "None" },
        ],
        adId: item.adId,
        clientId: item.clientId,
        adName: item.adName,
        creativeImageUrl: item.creativeImageUrl,
        creativeVideoUrl: item.creativeVideoUrl,
        sourceHref: item.clientId ? `/app/clients/${item.clientId}/ads` : "/app/engine",
      }));
    }
    if (activeTab === "queue") {
      return data.queue.map((item) => ({
        id: `queue-${item.id}`,
        title: prettyLabel(item.decisionType),
        subtitle: item.adName ?? "Unknown ad",
        status: item.status,
        reason: item.reason,
        action: null,
        confidence: null,
        timestampLabel: item.executedAt ? "Executed" : "Queued",
        timestampValue: item.executedAt ?? item.createdAt,
        detailRows: [
          { label: "Queue ID", value: String(item.id) },
          { label: "Risk", value: item.riskLevel ?? "Unknown" },
          {
            label: "Execution error",
            value: item.executionError ?? "None",
          },
        ],
        adId: item.adId,
        clientId: item.clientId,
        adName: item.adName,
        creativeImageUrl: item.creativeImageUrl,
        creativeVideoUrl: item.creativeVideoUrl,
        sourceHref: "/app/meta-queue",
      }));
    }
    return data.outcomes.map((item) => ({
      id: `outcome-${item.id}`,
      title: prettyLabel(item.decisionType),
      subtitle: item.adName ?? "Unknown ad",
      status: item.verdict ?? item.status,
      reason: item.verdictReason,
      action: null,
      confidence: null,
      timestampLabel: item.measuredAt ? "Measured" : "Queued",
      timestampValue: item.measuredAt ?? item.createdAt,
      detailRows: [
        { label: "Outcome ID", value: String(item.id) },
        { label: "Queue ID", value: String(item.queueId) },
        {
          label: "CTR lift",
          value:
            item.ctrLiftPct == null
              ? "N/A"
              : `${item.ctrLiftPct > 0 ? "+" : ""}${item.ctrLiftPct.toFixed(1)}%`,
        },
      ],
      adId: item.adId,
      clientId: item.clientId,
      adName: item.adName,
      creativeImageUrl: item.creativeImageUrl,
      creativeVideoUrl: item.creativeVideoUrl,
      sourceHref: "/app/meta-queue",
    }));
  }, [activeTab, data.decisions, data.outcomes, data.queue]);

  useEffect(() => {
    if (!selectedId) return;
    const stillExists = items.some((item) => item.id === selectedId);
    if (!stillExists) setSelectedId(null);
  }, [items, selectedId]);

  const selected = items.find((item) => item.id === selectedId) ?? null;

  const counts: Record<Tab, number> = {
    decisions: data.decisions.length,
    queue: data.queue.length,
    outcomes: data.outcomes.length,
  };

  return (
    <>
      <section
        style={{
          borderRadius: 16,
          border: "1px solid rgba(16,24,40,0.08)",
          background: "rgba(255,255,255,0.78)",
          backdropFilter: "blur(8px)",
          boxShadow: "0 10px 24px rgba(16, 24, 40, 0.05)",
          padding: 14,
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <div>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#18181b" }}>
            Insights rail
          </h3>
          <p style={{ margin: "3px 0 0", fontSize: 12, color: "#71717a" }}>
            Live feed from ad_decisions, meta_execution_queue, and decision_outcomes.
          </p>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {(Object.keys(TAB_LABELS) as Tab[]).map((tab) => {
            const isActive = activeTab === tab;
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  borderRadius: 999,
                  border: isActive ? "1px solid #1d4ed8" : "1px solid #d4d4d8",
                  background: isActive ? "#dbeafe" : "#fff",
                  color: isActive ? "#1e3a8a" : "#52525b",
                  padding: "5px 10px",
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {TAB_LABELS[tab]} ({counts[tab]})
              </button>
            );
          })}
        </div>

        {items.length === 0 ? (
          <div
            style={{
              borderRadius: 10,
              border: "1px dashed #d4d4d8",
              padding: 10,
              fontSize: 12,
              color: "#71717a",
            }}
          >
            No recent rows in this stream.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 11, color: "#71717a" }}>
              Click a row to open its drawer.
            </div>
            {items.map((item) => {
              const tone = toneForStatus(item.status);
              const isActive = item.id === selectedId;
              return (
                <button
                  key={item.id}
                  onClick={() => setSelectedId(item.id)}
                  style={{
                    borderRadius: 10,
                    border: isActive ? "1px solid #1d4ed8" : "1px solid #e4e4e7",
                    background: isActive ? "#eff6ff" : "#fff",
                    textAlign: "left",
                    padding: "9px 10px",
                    cursor: "pointer",
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        color: "#18181b",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {item.title}
                    </div>
                    <span
                      style={{
                        borderRadius: 999,
                        border: `1px solid ${tone.border}`,
                        background: tone.bg,
                        color: tone.fg,
                        fontSize: 10,
                        fontWeight: 700,
                        padding: "1px 7px",
                        textTransform: "uppercase",
                      }}
                    >
                      {item.status}
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: "#52525b",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {item.subtitle}
                  </div>
                  <div style={{ fontSize: 10, color: "#a1a1aa" }}>
                    {item.timestampLabel}: {formatDate(item.timestampValue)}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {selected && (
        <>
          <button
            aria-label="Close drawer backdrop"
            onClick={() => setSelectedId(null)}
            style={{
              position: "fixed",
              inset: 0,
              border: "none",
              background: "rgba(15, 23, 42, 0.3)",
              zIndex: 39,
              cursor: "pointer",
            }}
          />
          <aside
            style={{
              position: "fixed",
              right: 12,
              top: 12,
              bottom: 12,
              width: "min(460px, calc(100vw - 24px))",
              borderRadius: 16,
              border: "1px solid rgba(16,24,40,0.12)",
              background: "#ffffff",
              boxShadow: "0 24px 48px rgba(15, 23, 42, 0.25)",
              zIndex: 40,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "12px 14px",
                borderBottom: "1px solid #e4e4e7",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div>
                <div style={{ fontSize: 11, color: "#71717a", textTransform: "uppercase" }}>
                  Decision drawer
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#18181b" }}>
                  {selected.title}
                </div>
              </div>
              <button
                onClick={() => setSelectedId(null)}
                style={{
                  borderRadius: 8,
                  border: "1px solid #d4d4d8",
                  background: "#fff",
                  color: "#52525b",
                  fontSize: 12,
                  fontWeight: 600,
                  padding: "5px 10px",
                  cursor: "pointer",
                }}
              >
                Close
              </button>
            </div>

            <div style={{ padding: 14, overflowY: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", gap: 10 }}>
                <AdCreativeThumb
                  imageUrl={selected.creativeImageUrl}
                  videoUrl={selected.creativeVideoUrl}
                  alt={selected.adName ?? "Ad creative"}
                  size={72}
                  href={
                    selected.clientId && selected.adId
                      ? `/app/clients/${selected.clientId}/ads/${selected.adId}`
                      : null
                  }
                />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#18181b" }}>
                    {selected.adName ?? "Unknown ad"}
                  </div>
                  <div style={{ marginTop: 2, fontSize: 12, color: "#71717a" }}>
                    {selected.timestampLabel}: {formatDate(selected.timestampValue)}
                  </div>
                  {selected.confidence && (
                    <div style={{ marginTop: 2, fontSize: 12, color: "#52525b" }}>
                      Confidence: {selected.confidence}
                    </div>
                  )}
                </div>
              </div>

              {selected.reason && (
                <div
                  style={{
                    border: "1px solid #e4e4e7",
                    borderRadius: 10,
                    padding: "10px 11px",
                    background: "#fafafa",
                  }}
                >
                  <div style={{ fontSize: 11, color: "#71717a", textTransform: "uppercase" }}>
                    Why
                  </div>
                  <div style={{ marginTop: 4, fontSize: 13, color: "#27272a", lineHeight: 1.5 }}>
                    {selected.reason}
                  </div>
                </div>
              )}

              {selected.action && (
                <div
                  style={{
                    border: "1px solid #dbeafe",
                    borderRadius: 10,
                    padding: "10px 11px",
                    background: "#eff6ff",
                  }}
                >
                  <div style={{ fontSize: 11, color: "#1e3a8a", textTransform: "uppercase" }}>
                    Proposed action
                  </div>
                  <div style={{ marginTop: 4, fontSize: 13, color: "#1e3a8a", lineHeight: 1.5 }}>
                    {selected.action}
                  </div>
                </div>
              )}

              <div
                style={{
                  border: "1px solid #e4e4e7",
                  borderRadius: 10,
                  padding: "10px 11px",
                  background: "#fff",
                  display: "grid",
                  gap: 8,
                }}
              >
                {selected.detailRows.map((row) => (
                  <div
                    key={row.label}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 12,
                      fontSize: 12,
                    }}
                  >
                    <span style={{ color: "#71717a" }}>{row.label}</span>
                    <span style={{ color: "#18181b", fontWeight: 600 }}>{row.value}</span>
                  </div>
                ))}
              </div>
            </div>

            <div
              style={{
                borderTop: "1px solid #e4e4e7",
                padding: 12,
                display: "flex",
                justifyContent: "space-between",
                gap: 10,
              }}
            >
              <Link
                href={selected.sourceHref}
                style={{
                  borderRadius: 8,
                  border: "1px solid #d4d4d8",
                  background: "#fff",
                  color: "#52525b",
                  fontSize: 12,
                  fontWeight: 600,
                  textDecoration: "none",
                  padding: "7px 10px",
                }}
              >
                Open source list
              </Link>
              {selected.clientId && selected.adId && (
                <Link
                  href={`/app/clients/${selected.clientId}/ads/${selected.adId}`}
                  style={{
                    borderRadius: 8,
                    border: "1px solid #1d4ed8",
                    background: "#1d4ed8",
                    color: "#fff",
                    fontSize: 12,
                    fontWeight: 700,
                    textDecoration: "none",
                    padding: "7px 10px",
                  }}
                >
                  Open ad detail
                </Link>
              )}
            </div>
          </aside>
        </>
      )}
    </>
  );
}
