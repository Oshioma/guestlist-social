"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  confidencePalette,
  type Confidence,
} from "@/app/admin-panel/lib/action-confidence";

type AdAction = {
  id: string;
  ad_id: number;
  ad_name: string;
  problem: string;
  action: string;
  priority: string;
  status: string;
  hypothesis?: string | null;
  validated_by?: string | null;
  outcome?: string | null;
  result_summary?: string | null;
  metric_snapshot_before?: Record<string, unknown> | null;
  metric_snapshot_after?: Record<string, unknown> | null;
  completed_at?: string | null;
  // Trust pass enrichment — populated by the page from global_learnings
  // and a "last similar action" lookup. All optional so a row without a
  // matching pattern still renders cleanly.
  confidence?: Confidence;
  evidence?: string | null;
  expected_outcome?: string | null;
  last_similar?: string | null;
};

const priorityColors: Record<string, { bg: string; text: string }> = {
  high: { bg: "#fee2e2", text: "#991b1b" },
  medium: { bg: "#fef3c7", text: "#92400e" },
  low: { bg: "#f4f4f5", text: "#71717a" },
};

const outcomeColors: Record<string, { bg: string; text: string }> = {
  positive: { bg: "#dcfce7", text: "#166534" },
  neutral: { bg: "#fef3c7", text: "#92400e" },
  negative: { bg: "#fee2e2", text: "#991b1b" },
};

function MetricDiff({
  label,
  before,
  after,
  lowerIsBetter,
}: {
  label: string;
  before: number;
  after: number;
  lowerIsBetter?: boolean;
}) {
  const diff = after - before;
  if (diff === 0) return null;

  const improved = lowerIsBetter ? diff < 0 : diff > 0;

  return (
    <span style={{ fontSize: 12, color: improved ? "#166534" : "#991b1b" }}>
      {label}: {before.toLocaleString()} → {after.toLocaleString()}{" "}
      ({diff > 0 ? "+" : ""}
      {diff.toLocaleString()})
    </span>
  );
}

export default function AdActionRow({ action }: { action: AdAction }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [showComplete, setShowComplete] = useState(false);
  const [hypothesis, setHypothesis] = useState("");
  const [resultSummary, setResultSummary] = useState("");
  const [manualOutcome, setManualOutcome] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const pColors = priorityColors[action.priority] ?? priorityColors.medium;
  const confidence: Confidence = action.confidence ?? "unknown";
  const confPalette = confidencePalette(confidence);
  const showTrustPanel = Boolean(
    action.evidence || action.expected_outcome || action.last_similar
  );

  async function handleStart() {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/start-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actionId: action.id,
          hypothesis: hypothesis || null,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        setMessage(`Error: ${data.error}`);
      } else {
        setMessage("Started — before snapshot captured");
        router.refresh();
      }
    } catch {
      setMessage("Network error");
    } finally {
      setLoading(false);
    }
  }

  async function handleComplete() {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/complete-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actionId: action.id,
          resultSummary: resultSummary || null,
          manualOutcome: manualOutcome || null,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        setMessage(`Error: ${data.error}`);
      } else {
        setMessage(`Completed — outcome: ${data.outcome}`);
        setShowComplete(false);
        router.refresh();
      }
    } catch {
      setMessage("Network error");
    } finally {
      setLoading(false);
    }
  }

  const before = action.metric_snapshot_before as Record<string, number> | null;
  const after = action.metric_snapshot_after as Record<string, number> | null;

  return (
    <div
      style={{
        border: "1px solid #e4e4e7",
        borderRadius: 12,
        padding: 16,
        background: "#fff",
      }}
    >
      {/* Header row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <span style={{ fontSize: 15, fontWeight: 600, color: "#18181b" }}>
          {action.ad_name}
        </span>
        <span
          style={{
            padding: "2px 10px",
            borderRadius: 999,
            fontSize: 12,
            fontWeight: 600,
            background: pColors.bg,
            color: pColors.text,
            textTransform: "uppercase",
          }}
        >
          {action.priority}
        </span>
        <span
          style={{
            padding: "2px 10px",
            borderRadius: 999,
            fontSize: 12,
            fontWeight: 500,
            background: action.status === "completed" ? "#dcfce7" : action.status === "in_progress" ? "#dbeafe" : "#f4f4f5",
            color: action.status === "completed" ? "#166534" : action.status === "in_progress" ? "#1e40af" : "#71717a",
          }}
        >
          {action.status}
        </span>
        {action.outcome && (
          <span
            style={{
              padding: "2px 10px",
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 600,
              background: outcomeColors[action.outcome]?.bg ?? "#f4f4f5",
              color: outcomeColors[action.outcome]?.text ?? "#71717a",
              textTransform: "uppercase",
            }}
          >
            {action.outcome}
          </span>
        )}
        <span
          style={{
            marginLeft: "auto",
            padding: "2px 10px",
            borderRadius: 999,
            fontSize: 11,
            fontWeight: 600,
            background: confPalette.bg,
            color: confPalette.fg,
            border: `1px solid ${confPalette.border}`,
            textTransform: "uppercase",
            letterSpacing: "0.04em",
          }}
          title="How confident we are in this suggestion based on past results across all clients"
        >
          {confPalette.label}
        </span>
      </div>

      {/* Problem + Action */}
      {(() => {
        const isOpportunity = /winning|winner|scale/i.test(action.problem);
        const labelText = isOpportunity ? "Opportunity" : "Problem";
        const labelColor = isOpportunity ? "#166534" : "#991b1b";
        return (
          <div style={{ marginTop: 8, fontSize: 14, lineHeight: 1.5 }}>
            <span style={{ color: labelColor, fontWeight: 600 }}>
              {labelText}: {action.problem}
            </span>
            <span style={{ color: "#71717a", margin: "0 8px" }}>→</span>
            <span style={{ color: "#18181b", fontWeight: 500 }}>{action.action}</span>
          </div>
        );
      })()}

      {/* Trust panel: why we're suggesting this, what we expect, last result */}
      {showTrustPanel ? (
        <div
          style={{
            marginTop: 10,
            padding: "10px 12px",
            background: "#fafafa",
            border: "1px solid #f4f4f5",
            borderRadius: 10,
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "#71717a",
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              marginBottom: 2,
            }}
          >
            Why we&rsquo;re suggesting this
          </div>
          {action.evidence && (
            <div style={{ fontSize: 13, color: "#27272a", lineHeight: 1.5 }}>
              {action.evidence}
            </div>
          )}
          {action.expected_outcome && (
            <div style={{ fontSize: 13, color: "#52525b", lineHeight: 1.5 }}>
              {action.expected_outcome}
            </div>
          )}
          {action.last_similar && (
            <div
              style={{
                fontSize: 12,
                color: "#52525b",
                lineHeight: 1.5,
                marginTop: 2,
                fontStyle: "italic",
              }}
            >
              {action.last_similar}
            </div>
          )}
        </div>
      ) : (
        confidence === "unknown" && (
          <div
            style={{
              marginTop: 10,
              padding: "8px 12px",
              background: "#fafafa",
              border: "1px dashed #e4e4e7",
              borderRadius: 10,
              fontSize: 12,
              color: "#71717a",
              lineHeight: 1.5,
            }}
          >
            No prior pattern matches this suggestion yet. Treat it as a fresh
            test — we&rsquo;ll learn from the outcome.
          </div>
        )
      )}

      {/* Hypothesis */}
      {action.hypothesis && (
        <div style={{ marginTop: 6, fontSize: 13, color: "#52525b", fontStyle: "italic" }}>
          Hypothesis: {action.hypothesis}
        </div>
      )}

      {/* Result summary */}
      {action.result_summary && (
        <div style={{ marginTop: 6, fontSize: 13, color: "#52525b" }}>
          Result: {action.result_summary}
        </div>
      )}

      {/* Before / After metric diffs */}
      {before && after && (
        <div
          style={{
            marginTop: 8,
            display: "flex",
            gap: 16,
            flexWrap: "wrap",
            padding: "6px 10px",
            background: "#fafafa",
            borderRadius: 8,
            border: "1px solid #f4f4f5",
          }}
        >
          <MetricDiff label="CTR" before={before.ctr ?? 0} after={after.ctr ?? 0} />
          <MetricDiff label="CPC" before={before.cpc ?? 0} after={after.cpc ?? 0} lowerIsBetter />
          <MetricDiff label="Conversions" before={before.conversions ?? 0} after={after.conversions ?? 0} />
          <MetricDiff label="Score" before={before.performance_score ?? 0} after={after.performance_score ?? 0} />
        </div>
      )}

      {/* Action buttons */}
      <div style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        {action.status === "pending" && (
          <>
            <input
              type="text"
              placeholder="Hypothesis (optional)"
              value={hypothesis}
              onChange={(e) => setHypothesis(e.target.value)}
              style={{
                padding: "4px 10px",
                borderRadius: 6,
                border: "1px solid #e4e4e7",
                fontSize: 12,
                width: 220,
              }}
            />
            <button
              onClick={handleStart}
              disabled={loading}
              style={{
                padding: "4px 14px",
                borderRadius: 6,
                border: "1px solid #e4e4e7",
                background: "#18181b",
                color: "#fff",
                fontSize: 12,
                fontWeight: 600,
                cursor: loading ? "not-allowed" : "pointer",
              }}
            >
              {loading ? "Starting..." : "Start Action"}
            </button>
          </>
        )}

        {action.status === "in_progress" && !showComplete && (
          <button
            onClick={() => setShowComplete(true)}
            style={{
              padding: "4px 14px",
              borderRadius: 6,
              border: "1px solid #e4e4e7",
              background: "#166534",
              color: "#fff",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Mark Complete
          </button>
        )}

        {action.status === "in_progress" && showComplete && (
          <>
            <input
              type="text"
              placeholder="What happened? (result summary)"
              value={resultSummary}
              onChange={(e) => setResultSummary(e.target.value)}
              style={{
                padding: "4px 10px",
                borderRadius: 6,
                border: "1px solid #e4e4e7",
                fontSize: 12,
                width: 260,
              }}
            />
            <select
              value={manualOutcome}
              onChange={(e) => setManualOutcome(e.target.value)}
              style={{
                padding: "4px 8px",
                borderRadius: 6,
                border: "1px solid #e4e4e7",
                fontSize: 12,
              }}
            >
              <option value="">Auto-detect outcome</option>
              <option value="positive">Positive</option>
              <option value="neutral">Neutral</option>
              <option value="negative">Negative</option>
            </select>
            <button
              onClick={handleComplete}
              disabled={loading}
              style={{
                padding: "4px 14px",
                borderRadius: 6,
                border: "1px solid #e4e4e7",
                background: "#166534",
                color: "#fff",
                fontSize: 12,
                fontWeight: 600,
                cursor: loading ? "not-allowed" : "pointer",
              }}
            >
              {loading ? "Saving..." : "Complete"}
            </button>
            <button
              onClick={() => setShowComplete(false)}
              style={{
                padding: "4px 10px",
                borderRadius: 6,
                border: "1px solid #e4e4e7",
                background: "#fff",
                color: "#71717a",
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
          </>
        )}

        {message && (
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
    </div>
  );
}
