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
  dry_run?: boolean;
  generated?: number;
  total?: number;
  pattern_backed?: number;
  patterns_loaded?: number;
  feedback?: {
    slices_loaded: number;
    blocked_by_feedback: number;
    boosted_by_feedback: number;
  };
  queue?: {
    would_queue_pause?: number;
    would_queue_budget?: number;
  };
  previews?: Preview[];
};

const confidenceColor: Record<string, { bg: string; text: string }> = {
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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button
          onClick={handleClick}
          disabled={loading}
          style={{
            padding: "6px 16px",
            borderRadius: 8,
            border: "1px solid #18181b",
            background: loading ? "#f4f4f5" : "#fff",
            color: loading ? "#71717a" : "#18181b",
            fontSize: 13,
            fontWeight: 600,
            cursor: loading ? "not-allowed" : "pointer",
          }}
          title="Show what the engine would do without writing anything to ad_decisions or the queue."
        >
          {loading ? "Previewing..." : "Preview Decisions (dry run)"}
        </button>
        {error && (
          <span style={{ fontSize: 12, color: "#991b1b" }}>{error}</span>
        )}
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
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
              marginBottom: 14,
              alignItems: "center",
            }}
          >
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                color: "#3f3f46",
                padding: "3px 10px",
                borderRadius: 999,
                background: "#fff",
                border: "1px solid #e4e4e7",
              }}
            >
              Dry run · nothing written
            </span>
            <Stat
              label="would generate"
              value={`${result.generated ?? 0} / ${result.total ?? 0}`}
            />
            <Stat label="pattern-backed" value={result.pattern_backed ?? 0} />
            <Stat
              label="would pause"
              value={result.queue?.would_queue_pause ?? 0}
            />
            <Stat
              label="would scale budget"
              value={result.queue?.would_queue_budget ?? 0}
            />
            {result.feedback && result.feedback.blocked_by_feedback > 0 && (
              <Stat
                label="blocked by feedback"
                value={result.feedback.blocked_by_feedback}
                tone="warn"
              />
            )}
            {result.feedback && result.feedback.boosted_by_feedback > 0 && (
              <Stat
                label="boosted by feedback"
                value={result.feedback.boosted_by_feedback}
                tone="good"
              />
            )}
          </div>

          {result.previews && result.previews.length > 0 ? (
            <div
              style={{ display: "flex", flexDirection: "column", gap: 8 }}
            >
              {result.previews.map((p) => {
                const cc = confidenceColor[p.decision.confidence] ?? confidenceColor.low;
                return (
                  <div
                    key={p.ad_id}
                    style={{
                      border: "1px solid #e4e4e7",
                      borderRadius: 12,
                      padding: 12,
                      background: "#fff",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        marginBottom: 6,
                        flexWrap: "wrap",
                      }}
                    >
                      <span
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: "#18181b",
                        }}
                      >
                        {p.ad_name}
                      </span>
                      <span
                        style={{
                          padding: "2px 8px",
                          borderRadius: 999,
                          fontSize: 11,
                          fontWeight: 600,
                          background: "#f4f4f5",
                          color: "#52525b",
                          textTransform: "uppercase",
                        }}
                      >
                        {p.decision.type}
                      </span>
                      <span
                        style={{
                          padding: "2px 8px",
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
                      {p.pattern_backed && (
                        <span
                          style={{
                            padding: "2px 8px",
                            borderRadius: 999,
                            fontSize: 11,
                            fontWeight: 600,
                            background: "#dbeafe",
                            color: "#1e40af",
                          }}
                          title={
                            p.decision.source_pattern_key ?? undefined
                          }
                        >
                          pattern · {p.decision.source_pattern_key}
                          {p.decision.source_pattern_industry
                            ? ` · ${p.decision.source_pattern_industry}`
                            : ""}
                        </span>
                      )}
                      {p.would_queue_pause && (
                        <span
                          style={{
                            padding: "2px 8px",
                            borderRadius: 999,
                            fontSize: 11,
                            fontWeight: 600,
                            background: "#fef3c7",
                            color: "#92400e",
                          }}
                        >
                          would queue: pause
                        </span>
                      )}
                      {p.would_queue_budget && (
                        <span
                          style={{
                            padding: "2px 8px",
                            borderRadius: 999,
                            fontSize: 11,
                            fontWeight: 600,
                            background: "#dcfce7",
                            color: "#166534",
                          }}
                        >
                          would queue: scale budget
                        </span>
                      )}
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
                      {p.decision.reason}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div
              style={{
                fontSize: 13,
                color: "#71717a",
                fontStyle: "italic",
              }}
            >
              No decisions would fire for this client right now.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone?: "good" | "warn";
}) {
  const colors =
    tone === "good"
      ? { bg: "#dcfce7", text: "#166534" }
      : tone === "warn"
        ? { bg: "#fef3c7", text: "#92400e" }
        : { bg: "#fff", text: "#3f3f46" };
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "3px 10px",
        borderRadius: 999,
        background: colors.bg,
        color: colors.text,
        border: "1px solid #e4e4e7",
        fontSize: 12,
      }}
    >
      <strong>{value}</strong>
      <span style={{ fontWeight: 400 }}>{label}</span>
    </span>
  );
}
