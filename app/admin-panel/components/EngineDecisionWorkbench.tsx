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

function prettyStatus(value: string): string {
  return value.replaceAll("_", " ");
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

function canUseMatchMedia() {
  return typeof window !== "undefined" && typeof window.matchMedia === "function";
}

export default function EngineDecisionWorkbench({
  data,
}: {
  data: EngineDecisionWorkbenchData;
}) {
  const [activeTab, setActiveTab] = useState<Tab>("decisions");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isNarrowViewport, setIsNarrowViewport] = useState(false);

  useEffect(() => {
    if (!canUseMatchMedia()) return;
    const query = window.matchMedia("(max-width: 900px)");
    const apply = () => setIsNarrowViewport(query.matches);
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, []);

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

  useEffect(() => {
    if (!selectedId) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedId(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedId]);

  useEffect(() => {
    if (!selectedId) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [selectedId]);

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
          borderRadius: 18,
          border: "1px solid rgba(16,24,40,0.1)",
          background:
            "linear-gradient(168deg, rgba(255,255,255,0.92) 0%, rgba(246,248,252,0.88) 100%)",
          backdropFilter: "blur(10px)",
          boxShadow: "0 14px 34px rgba(16, 24, 40, 0.08)",
          padding: 15,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span
              aria-hidden
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: "#22c55e",
                boxShadow: "0 0 0 4px rgba(34,197,94,0.16)",
              }}
            />
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: "#18181b" }}>
              Insights rail
            </h3>
          </div>
          <p style={{ margin: "4px 0 0", fontSize: 12, color: "#667085" }}>
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
                  border: isActive ? "1px solid #93c5fd" : "1px solid #d4d4d8",
                  background: isActive ? "#eff6ff" : "#fff",
                  color: isActive ? "#1e3a8a" : "#475467",
                  padding: "6px 11px",
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: "pointer",
                  boxShadow: isActive
                    ? "0 1px 0 rgba(255,255,255,0.7) inset, 0 6px 14px rgba(37,99,235,0.16)"
                    : "0 1px 0 rgba(255,255,255,0.8) inset",
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
              padding: 12,
              fontSize: 12,
              color: "#71717a",
              background: "rgba(255,255,255,0.7)",
            }}
          >
            No recent rows in this stream.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, minHeight: 0 }}>
            <div style={{ fontSize: 11, color: "#667085", fontWeight: 600 }}>
              Click a row to open its drawer.
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 8,
                maxHeight: isNarrowViewport ? "min(44vh, 420px)" : "min(58vh, 560px)",
                overflowY: "auto",
                paddingRight: 2,
              }}
            >
              {items.map((item) => {
                const tone = toneForStatus(item.status);
                const isActive = item.id === selectedId;
                return (
                  <button
                    key={item.id}
                    onClick={() => setSelectedId(item.id)}
                    style={{
                      borderRadius: 12,
                      border: isActive ? "1px solid #93c5fd" : "1px solid #e4e4e7",
                      background: isActive
                        ? "linear-gradient(170deg, #eff6ff 0%, #f8fbff 100%)"
                        : "#fff",
                      textAlign: "left",
                      padding: "10px 11px",
                      cursor: "pointer",
                      display: "flex",
                      flexDirection: "column",
                      gap: 7,
                      boxShadow: isActive
                        ? "0 8px 18px rgba(37,99,235,0.12)"
                        : "0 1px 0 rgba(255,255,255,0.8) inset",
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
                        {prettyStatus(item.status)}
                      </span>
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: "#475467",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {item.subtitle}
                    </div>
                    <div
                      style={{
                        fontSize: 10,
                        color: "#98a2b3",
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 8,
                      }}
                    >
                      <span>
                        {item.timestampLabel}: {formatDate(item.timestampValue)}
                      </span>
                      <span style={{ color: isActive ? "#1d4ed8" : "#94a3b8" }}>
                        Open →
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
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
              background: "rgba(2, 6, 23, 0.44)",
              zIndex: 39,
              cursor: "pointer",
              backdropFilter: "blur(2px)",
            }}
          />
          <aside
            style={{
              position: "fixed",
              right: isNarrowViewport ? 0 : 12,
              top: isNarrowViewport ? 0 : 12,
              bottom: isNarrowViewport ? 0 : 12,
              width: isNarrowViewport ? "100vw" : "min(500px, calc(100vw - 24px))",
              borderRadius: isNarrowViewport ? 0 : 16,
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
                padding: "13px 14px",
                borderBottom: "1px solid #e4e4e7",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 10,
                background:
                  "linear-gradient(165deg, rgba(239,246,255,0.9) 0%, rgba(255,255,255,0.95) 100%)",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 11, color: "#667085", textTransform: "uppercase" }}>
                  Decision drawer
                </div>
                <div
                  style={{
                    fontSize: 16,
                    fontWeight: 800,
                    color: "#18181b",
                    overflow: "hidden",
                    whiteSpace: "nowrap",
                    textOverflow: "ellipsis",
                  }}
                >
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

            <div
              style={{
                padding: 14,
                overflowY: "auto",
                display: "flex",
                flexDirection: "column",
                gap: 12,
                background: "linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  gap: 10,
                  border: "1px solid #e4e4e7",
                  borderRadius: 12,
                  padding: 10,
                  background: "#fff",
                }}
              >
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
                  <div style={{ marginTop: 2, fontSize: 12, color: "#667085" }}>
                    {selected.timestampLabel}: {formatDate(selected.timestampValue)}
                  </div>
                  <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 6 }}>
                    <span
                      style={{
                        borderRadius: 999,
                        border: `1px solid ${toneForStatus(selected.status).border}`,
                        background: toneForStatus(selected.status).bg,
                        color: toneForStatus(selected.status).fg,
                        fontSize: 10,
                        fontWeight: 700,
                        padding: "2px 8px",
                        textTransform: "uppercase",
                      }}
                    >
                      {prettyStatus(selected.status)}
                    </span>
                    {selected.confidence && (
                      <span
                        style={{
                          borderRadius: 999,
                          border: "1px solid #bfdbfe",
                          background: "#eff6ff",
                          color: "#1e3a8a",
                          fontSize: 10,
                          fontWeight: 700,
                          padding: "2px 8px",
                          textTransform: "uppercase",
                        }}
                      >
                        Confidence {selected.confidence}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {selected.reason && (
                <div
                  style={{
                    border: "1px solid #e4e4e7",
                    borderRadius: 10,
                    padding: "10px 11px",
                    background: "#fff",
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
                    background: "#f0f7ff",
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
                  background: "#ffffff",
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
                      borderBottom: "1px solid #f2f4f7",
                      paddingBottom: 6,
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
                justifyContent: isNarrowViewport ? "flex-end" : "space-between",
                flexWrap: "wrap",
                gap: 10,
                background: "#fff",
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
