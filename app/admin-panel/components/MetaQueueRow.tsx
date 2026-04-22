"use client";

// Client-side card for one meta_execution_queue row.
//
// The server page hands us a normalized shape (joined client/ad/campaign
// labels already resolved) so this component can stay focused on the
// approve / preview / execute / cancel interactions.
//
// All four buttons hit /api/meta-execute-decision — that route is the
// single entry point for anything that touches Meta. We never call the
// executors directly from here.

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AdCreativeThumb from "./AdCreativeThumb";

export type MetaQueueRowData = {
  id: number;
  decisionType:
    | "pause_ad"
    | "increase_adset_budget"
    | "decrease_adset_budget"
    | "duplicate_ad"
    | string;
  status: "pending" | "approved" | "executed" | "failed" | "cancelled" | string;
  riskLevel: "low" | "medium" | "high" | string;
  reason: string | null;
  proposedPayload: Record<string, unknown> | null;
  clientName: string | null;
  adName: string | null;
  adId: number | null;
  clientId: number | null;
  creativeImageUrl: string | null;
  creativeVideoUrl: string | null;
  campaignName: string | null;
  adMetaId: string | null;
  adsetMetaId: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  executedAt: string | null;
  executionResult: unknown;
  executionError: string | null;
  lastCheckedAt: string | null;
  lastCheckedState: unknown;
  sourcePatternKey: string | null;
  sourcePatternIndustry: string | null;
  createdAt: string;
};

const decisionLabels: Record<string, string> = {
  pause_ad: "Pause ad",
  increase_adset_budget: "Increase ad set budget",
  decrease_adset_budget: "Pull back ad set budget",
  duplicate_ad: "Duplicate ad",
};

const statusLabels: Record<string, string> = {
  pending: "Waiting",
  approved: "Ready",
  executed: "Sent",
  failed: "Failed",
  cancelled: "Skipped",
};

const decisionColors: Record<string, { bg: string; text: string }> = {
  pause_ad: { bg: "#fee2e2", text: "#991b1b" },
  increase_adset_budget: { bg: "#dcfce7", text: "#166534" },
  decrease_adset_budget: { bg: "#fef3c7", text: "#854d0e" },
  duplicate_ad: { bg: "#dbeafe", text: "#1e40af" },
};

const statusColors: Record<string, { bg: string; text: string }> = {
  pending: { bg: "#fef3c7", text: "#92400e" },
  approved: { bg: "#dbeafe", text: "#1e40af" },
  executed: { bg: "#dcfce7", text: "#166534" },
  failed: { bg: "#fee2e2", text: "#991b1b" },
  cancelled: { bg: "#f4f4f5", text: "#71717a" },
};

const riskColors: Record<string, { bg: string; text: string; border: string }> = {
  low: { bg: "#f0fdf4", text: "#166534", border: "#bbf7d0" },
  medium: { bg: "#fefce8", text: "#854d0e", border: "#fde68a" },
  high: { bg: "#fef2f2", text: "#991b1b", border: "#fecaca" },
};

function formatTimestamp(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatPayloadSummary(
  decisionType: string,
  payload: Record<string, unknown> | null
): string {
  if (!payload) return "(no payload)";
  if (decisionType === "pause_ad") {
    return `Set status → ${String(payload.status ?? "PAUSED")}`;
  }
  if (decisionType === "increase_adset_budget") {
    const oldB = Number(payload.daily_budget_old ?? 0);
    const newB = Number(payload.daily_budget_new ?? 0);
    const pct = Number(payload.percent_change ?? 0);
    if (oldB && newB) {
      return `$${(oldB / 100).toFixed(2)} → $${(newB / 100).toFixed(2)}/day (+${pct}%)`;
    }
    return `+${pct}% daily budget`;
  }
  if (decisionType === "decrease_adset_budget") {
    const oldB = Number(payload.daily_budget_old ?? 0);
    const newB = Number(payload.daily_budget_new ?? 0);
    const pct = Number(payload.percent_change ?? 0);
    if (oldB && newB) {
      return `$${(oldB / 100).toFixed(2)} → $${(newB / 100).toFixed(2)}/day (−${pct}%)`;
    }
    return `−${pct}% daily budget`;
  }
  if (decisionType === "duplicate_ad") {
    const suffix = payload.new_name_suffix ? ` (suffix "${payload.new_name_suffix}")` : "";
    return `Copy ad → PAUSED${suffix}`;
  }
  return JSON.stringify(payload);
}

export default function MetaQueueRow({ row }: { row: MetaQueueRowData }) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [previewState, setPreviewState] = useState<unknown>(row.lastCheckedState);
  const [previewAt, setPreviewAt] = useState<string | null>(row.lastCheckedAt);

  const dl = decisionLabels[row.decisionType] ?? row.decisionType;
  const dc = decisionColors[row.decisionType] ?? { bg: "#f4f4f5", text: "#3f3f46" };
  const sc = statusColors[row.status] ?? { bg: "#f4f4f5", text: "#71717a" };
  const rc = riskColors[row.riskLevel] ?? riskColors.low;

  const isTerminal =
    row.status === "executed" ||
    row.status === "failed" ||
    row.status === "cancelled";

  const [lastError, setLastError] = useState<{
    message: string;
    action: string;
    staleApproval?: boolean;
  } | null>(null);

  async function handleAction(action: "approve" | "preview" | "execute" | "cancel") {
    setLoading(action);
    setMessage(null);
    setLastError(null);
    try {
      const res = await fetch("/api/meta-execute-decision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ queueId: row.id, action }),
      });
      const data = await res.json();
      if (!data.ok) {
        setLastError({
          message: data.error,
          action,
          staleApproval: data.stale_approval === true,
        });
        setMessage(`Error: ${data.error}`);
        if (action === "preview") {
          setPreviewState({ error: data.error });
          setPreviewAt(new Date().toISOString());
        }
      } else if (action === "preview") {
        setPreviewState(data.state);
        setPreviewAt(new Date().toISOString());
        setMessage(data.dryRun ? "Preview refreshed (no Meta write)" : "Preview refreshed");
      } else if (action === "execute") {
        setMessage(
          data.dryRun
            ? "Dry-run executed (META_EXECUTE_DRY_RUN is on)"
            : "Executed on Meta"
        );
        router.refresh();
      } else if (action === "approve") {
        setMessage("Approved");
        router.refresh();
      } else if (action === "cancel") {
        setMessage("Cancelled");
        router.refresh();
      }
    } catch {
      setMessage("Network error");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div
      style={{
        border: "1px solid #e4e4e7",
        borderRadius: 12,
        padding: 16,
        background: isTerminal ? "#fafafa" : "#fff",
      }}
    >
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        <AdCreativeThumb
          imageUrl={row.creativeImageUrl}
          videoUrl={row.creativeVideoUrl}
          alt={row.adName ?? row.campaignName ?? "Queued ad"}
          href={
            row.clientId && row.adId
              ? `/app/clients/${row.clientId}/ads/${row.adId}`
              : null
          }
        />

        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Header row: action type · client · ad */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span
              style={{
                padding: "3px 10px",
                borderRadius: 999,
                fontSize: 11,
                fontWeight: 700,
                background: dc.bg,
                color: dc.text,
                textTransform: "uppercase",
                letterSpacing: "0.04em",
              }}
            >
              {dl}
            </span>
            <span
              style={{
                padding: "2px 8px",
                borderRadius: 999,
                fontSize: 11,
                fontWeight: 600,
                background: sc.bg,
                color: sc.text,
                textTransform: "uppercase",
              }}
            >
              {statusLabels[row.status] ?? row.status}
            </span>
            <span
              style={{
                padding: "2px 8px",
                borderRadius: 999,
                fontSize: 11,
                fontWeight: 600,
                background: rc.bg,
                color: rc.text,
                border: `1px solid ${rc.border}`,
                textTransform: "uppercase",
                letterSpacing: "0.04em",
              }}
              title="Engine-assigned risk — executor still has hard caps"
            >
              {row.riskLevel} risk
            </span>
            <span style={{ flex: 1 }} />
            <span style={{ fontSize: 11, color: "#a1a1aa" }}>
              queued {formatTimestamp(row.createdAt)}
            </span>
          </div>

          {/* Subject line: who + what */}
          <div style={{ marginTop: 10, fontSize: 14, color: "#18181b", fontWeight: 600 }}>
            {row.clientName ?? "Unknown client"}
            {row.adName ? <> · <span style={{ fontWeight: 500 }}>{row.adName}</span></> : null}
            {!row.adName && row.campaignName ? (
              <> · <span style={{ fontWeight: 500 }}>{row.campaignName}</span></>
            ) : null}
          </div>
        </div>
      </div>

      {/* Proposed change */}
      <div
        style={{
          marginTop: 8,
          fontSize: 13,
          color: "#3f3f46",
          padding: "8px 12px",
          background: "#fafafa",
          borderRadius: 8,
          border: "1px solid #f4f4f5",
        }}
      >
        <span style={{ color: "#71717a", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em" }}>
          Proposed
        </span>
        <div style={{ marginTop: 2 }}>
          {formatPayloadSummary(row.decisionType, row.proposedPayload)}
        </div>
      </div>

      {/* Reason */}
      {row.reason && (
        <div style={{ marginTop: 8, fontSize: 13, color: "#52525b", lineHeight: 1.5 }}>
          <span style={{ color: "#71717a", fontWeight: 600 }}>Why:</span> {row.reason}
        </div>
      )}

      {/* Pattern provenance — only present when the engine seeded this row
          from a global_learnings pattern. Links back to the matching card
          on the playbook page so the operator can see the full track record. */}
      {row.sourcePatternKey && (
        <div style={{ marginTop: 6 }}>
          <Link
            href={`/app/whats-working${
              row.sourcePatternIndustry
                ? `?industry=${encodeURIComponent(row.sourcePatternIndustry)}`
                : ""
            }#pattern-${row.sourcePatternKey}`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "3px 10px",
              borderRadius: 999,
              fontSize: 11,
              fontWeight: 600,
              background: "#eff6ff",
              color: "#1d4ed8",
              border: "1px solid #bfdbfe",
              textDecoration: "none",
            }}
          >
            From the playbook: {row.sourcePatternKey}
            {row.sourcePatternIndustry ? ` (${row.sourcePatternIndustry})` : ""}
          </Link>
        </div>
      )}

      {/* Meta ids */}
      {(row.adMetaId || row.adsetMetaId) && (
        <div style={{ marginTop: 6, fontSize: 11, color: "#a1a1aa", fontFamily: "monospace" }}>
          {row.adMetaId ? <>ad: {row.adMetaId}</> : null}
          {row.adMetaId && row.adsetMetaId ? " · " : null}
          {row.adsetMetaId ? <>adset: {row.adsetMetaId}</> : null}
        </div>
      )}

      {/* Last checked state */}
      <div
        style={{
          marginTop: 10,
          padding: "8px 12px",
          background: "#fff",
          border: "1px dashed #e4e4e7",
          borderRadius: 8,
        }}
      >
        <div
          style={{
            fontSize: 11,
            color: "#71717a",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.04em",
            marginBottom: 4,
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          <span>Last peek at Meta</span>
          <span style={{ color: "#a1a1aa", fontWeight: 500 }}>
            {previewAt ? formatTimestamp(previewAt) : "never"}
          </span>
        </div>
        {previewState ? (
          <pre
            style={{
              fontSize: 11,
              color: "#27272a",
              margin: 0,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              maxHeight: 140,
              overflow: "auto",
            }}
          >
            {JSON.stringify(previewState, null, 2)}
          </pre>
        ) : (
          <div style={{ fontSize: 12, color: "#a1a1aa", fontStyle: "italic" }}>
            Click Preview to peek at the current state in Meta without changing anything.
          </div>
        )}
      </div>

      {/* Approval / execution trail */}
      {(row.approvedAt || row.executedAt || row.executionError) && (
        <div style={{ marginTop: 10, fontSize: 12, color: "#71717a" }}>
          {row.approvedAt && (
            <div>
              Approved {row.approvedBy ? `by ${row.approvedBy} ` : ""}
              {formatTimestamp(row.approvedAt)}
            </div>
          )}
          {row.executedAt && (
            <div>Executed {formatTimestamp(row.executedAt)}</div>
          )}
          {row.executionError && (
            <div style={{ color: "#991b1b", marginTop: 2 }}>
              Error: {row.executionError}
            </div>
          )}
        </div>
      )}

      {row.status === "executed" && row.executionResult ? (
        <details style={{ marginTop: 8 }}>
          <summary style={{ fontSize: 12, color: "#52525b", cursor: "pointer" }}>
            Execution result
          </summary>
          <pre
            style={{
              marginTop: 6,
              padding: "8px 10px",
              background: "#fafafa",
              border: "1px solid #f4f4f5",
              borderRadius: 6,
              fontSize: 11,
              maxHeight: 200,
              overflow: "auto",
            }}
          >
            {JSON.stringify(row.executionResult, null, 2)}
          </pre>
        </details>
      ) : null}

      {/* Action buttons */}
      {!isTerminal && (
        <div
          style={{
            marginTop: 12,
            display: "flex",
            gap: 8,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <button
            onClick={() => handleAction("preview")}
            disabled={loading !== null}
            style={{
              padding: "6px 14px",
              borderRadius: 6,
              border: "1px solid #e4e4e7",
              background: "#fff",
              color: "#3f3f46",
              fontSize: 12,
              fontWeight: 600,
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading === "preview" ? "..." : "Preview"}
          </button>
          {row.status === "pending" && (
            <button
              onClick={() => handleAction("approve")}
              disabled={loading !== null}
              style={{
                padding: "6px 14px",
                borderRadius: 6,
                border: "none",
                background: "#166534",
                color: "#fff",
                fontSize: 12,
                fontWeight: 600,
                cursor: loading ? "not-allowed" : "pointer",
              }}
            >
              {loading === "approve" ? "..." : "Approve"}
            </button>
          )}
          {row.status === "approved" && (
            <button
              onClick={() => handleAction("execute")}
              disabled={loading !== null}
              style={{
                padding: "6px 14px",
                borderRadius: 6,
                border: "none",
                background: "#18181b",
                color: "#fff",
                fontSize: 12,
                fontWeight: 600,
                cursor: loading ? "not-allowed" : "pointer",
              }}
            >
              {loading === "execute" ? "..." : "Execute"}
            </button>
          )}
          <button
            onClick={() => handleAction("cancel")}
            disabled={loading !== null}
            style={{
              padding: "6px 14px",
              borderRadius: 6,
              border: "1px solid #e4e4e7",
              background: "#fff",
              color: "#71717a",
              fontSize: 12,
              fontWeight: 600,
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading === "cancel" ? "..." : "Cancel"}
          </button>
          {message && !lastError && (
            <span
              style={{
                fontSize: 11,
                color: message.startsWith("Error") ? "#991b1b" : "#166534",
              }}
            >
              {message}
            </span>
          )}
        </div>
      )}

      {lastError && (
        <div
          style={{
            marginTop: 10,
            padding: "10px 14px",
            borderRadius: 10,
            background: "#fef2f2",
            border: "1px solid #fecaca",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <div style={{ fontSize: 13, color: "#991b1b", fontWeight: 500, lineHeight: 1.4 }}>
            {lastError.message}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {lastError.staleApproval ? (
              <button
                type="button"
                onClick={() => {
                  setLastError(null);
                  handleAction("preview");
                }}
                disabled={loading !== null}
                style={{
                  padding: "5px 12px",
                  borderRadius: 6,
                  border: "1px solid #e4e4e7",
                  background: "#fff",
                  color: "#18181b",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: loading ? "not-allowed" : "pointer",
                }}
              >
                Preview fresh state
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setLastError(null);
                  handleAction(lastError.action as "approve" | "preview" | "execute" | "cancel");
                }}
                disabled={loading !== null}
                style={{
                  padding: "5px 12px",
                  borderRadius: 6,
                  border: "none",
                  background: "#18181b",
                  color: "#fff",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: loading ? "not-allowed" : "pointer",
                }}
              >
                Retry
              </button>
            )}
            <button
              type="button"
              onClick={() => setLastError(null)}
              style={{
                padding: "5px 12px",
                borderRadius: 6,
                border: "1px solid #fecaca",
                background: "transparent",
                color: "#991b1b",
                fontSize: 12,
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
