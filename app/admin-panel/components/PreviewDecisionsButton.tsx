"use client";

import { useState } from "react";

type Decision = {
  type: string;
  reason: string;
  action: string;
  confidence: string;
  meta_action: string | null;
  source_pattern_key?: string | null;
  source_pattern_industry?: string | null;
};

type Preview = {
  ad_id: number;
  ad_name: string;
  decision: Decision;
  pattern_backed: boolean;
  would_queue_pause: boolean;
  would_queue_budget: boolean;
};

type PreviewResponse = {
  ok: boolean;
  error?: string;
  generated?: number;
  total?: number;
  queue?: {
    would_queue_pause?: number;
    would_queue_budget?: number;
  };
  feedback?: {
    blocked_by_feedback: number;
    boosted_by_feedback: number;
  };
  previews?: Preview[];
};

// Plain-English headline for each decision type. The decision.action field is
// already a sentence, so we just need a short noun for the chip on the right.
const TYPE_LABEL: Record<string, string> = {
  scale_budget: "Increase budget",
  pause_or_replace: "Pause this ad",
  kill_test: "Stop this test",
  apply_known_fix: "Try a proven fix",
  apply_winning_pattern: "Try a winning pattern",
};

const CONFIDENCE_COLOR: Record<string, { bg: string; text: string }> = {
  high: { bg: "#dcfce7", text: "#166534" },
  medium: { bg: "#fef9c3", text: "#854d0e" },
  low: { bg: "#f3f4f6", text: "#374151" },
};

export default function PreviewDecisionsButton({
  clientId,
}: {
  clientId: string;
}) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PreviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/generate-decisions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, dryRun: true }),
      });
      const data: PreviewResponse = await res.json();
      if (!data.ok) {
        setError(data.error ?? "Preview failed");
      } else {
        setResult(data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setLoading(false);
    }
  }

  const total = result?.total ?? 0;
  const generated = result?.generated ?? 0;
  const wouldPause = result?.queue?.would_queue_pause ?? 0;
  const wouldBudget = result?.queue?.would_queue_budget ?? 0;
  const wouldReview = Math.max(generated - wouldPause - wouldBudget, 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            onClick={handleClick}
            disabled={loading}
            style={{
              padding: "10px 20px",
              borderRadius: 10,
              border: "1px solid #18181b",
              background: loading ? "#f4f4f5" : "#fff",
              color: loading ? "#71717a" : "#18181b",
              fontSize: 14,
              fontWeight: 600,
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Thinking…" : "Show me what the engine would do"}
          </button>
          {error && (
            <span style={{ fontSize: 12, color: "#991b1b" }}>{error}</span>
          )}
        </div>
        <p style={{ fontSize: 12, color: "#71717a", margin: 0 }}>
          Same engine, but throws away the result. Nothing gets saved or queued — it's just a peek.
        </p>
      </div>

      {result && (
        <div
          style={{
            border: "1px solid #e4e4e7",
            borderRadius: 14,
            padding: 16,
            background: "#fafafa",
          }}
        >
          {/* Plain-English summary line. */}
          <p
            style={{
              margin: "0 0 6px",
              fontSize: 14,
              fontWeight: 600,
              color: "#18181b",
            }}
          >
            {generated === 0
              ? `Looked at ${total} ad${total === 1 ? "" : "s"}. Nothing to do right now.`
              : `Looked at ${total} ad${total === 1 ? "" : "s"}. Wants to take action on ${generated}.`}
          </p>
          {generated > 0 && (
            <p style={{ margin: "0 0 12px", fontSize: 13, color: "#52525b" }}>
              {[
                wouldPause > 0 &&
                  `${wouldPause} ad${wouldPause === 1 ? "" : "s"} would be paused`,
                wouldBudget > 0 &&
                  `${wouldBudget} would get a budget bump`,
                wouldReview > 0 &&
                  `${wouldReview} ${wouldReview === 1 ? "is" : "are"} just for your review`,
              ]
                .filter(Boolean)
                .join(" · ")}
              .
            </p>
          )}

          {result.previews && result.previews.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {result.previews.map((p) => {
                const cc =
                  CONFIDENCE_COLOR[p.decision.confidence] ?? CONFIDENCE_COLOR.low;
                const typeLabel =
                  TYPE_LABEL[p.decision.type] ?? p.decision.type;
                return (
                  <div
                    key={p.ad_id}
                    style={{
                      display: "flex",
                      gap: 12,
                      alignItems: "flex-start",
                      border: "1px solid #e4e4e7",
                      borderRadius: 12,
                      padding: 12,
                      background: "#fff",
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: "#18181b",
                          marginBottom: 2,
                        }}
                      >
                        {p.ad_name}
                      </div>
                      <div
                        style={{
                          fontSize: 13,
                          color: "#18181b",
                          marginBottom: 4,
                        }}
                      >
                        {p.decision.action}
                      </div>
                      <div style={{ fontSize: 12, color: "#71717a" }}>
                        Why: {p.decision.reason}
                      </div>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "flex-end",
                        gap: 4,
                        flexShrink: 0,
                      }}
                    >
                      <span
                        style={{
                          padding: "3px 10px",
                          borderRadius: 999,
                          fontSize: 11,
                          fontWeight: 600,
                          background: cc.bg,
                          color: cc.text,
                          textTransform: "uppercase",
                        }}
                      >
                        {p.decision.confidence}
                      </span>
                      <span
                        style={{
                          fontSize: 11,
                          color: "#52525b",
                          textAlign: "right",
                        }}
                      >
                        {typeLabel}
                      </span>
                      {(p.would_queue_pause || p.would_queue_budget) && (
                        <span style={{ fontSize: 11, color: "#71717a" }}>
                          Auto-queued
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Power-user footer: only shows when the feedback loop did something. */}
          {result.feedback &&
            (result.feedback.blocked_by_feedback > 0 ||
              result.feedback.boosted_by_feedback > 0) && (
              <p
                style={{
                  margin: "12px 0 0",
                  fontSize: 11,
                  color: "#71717a",
                  fontStyle: "italic",
                }}
              >
                Engine track record: blocked {result.feedback.blocked_by_feedback} suggestion
                {result.feedback.blocked_by_feedback === 1 ? "" : "s"} that have
                failed in the past · boosted {result.feedback.boosted_by_feedback} that
                {result.feedback.boosted_by_feedback === 1 ? " has" : " have"} a strong
                track record.
              </p>
            )}
        </div>
      )}
    </div>
  );
}
