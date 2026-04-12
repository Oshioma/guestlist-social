"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";

type ScoreResult = {
  scored: number;
  total: number;
  breakdown: { winner: number; losing: number; testing: number; paused: number };
};

type ActionsResult = {
  generated: number;
  skipped: number;
  total: number;
  priorityBreakdown: { high: number; medium: number; low: number };
  topActions: { ad_name: string; problem: string; action: string; priority: string }[];
};

type Step = "idle" | "scanning" | "scoring" | "generating" | "done" | "error";

const stepLabels: Record<Step, string> = {
  idle: "Score Ads & Generate Actions",
  scanning: "Scanning ads...",
  scoring: "Scoring performance...",
  generating: "Generating actions...",
  done: "Done",
  error: "Error",
};

export default function ScoreAndGenerateButton({
  clientId,
}: {
  clientId?: string;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("idle");
  const [scoreResult, setScoreResult] = useState<ScoreResult | null>(null);
  const [actionsResult, setActionsResult] = useState<ActionsResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  async function handleClick() {
    setStep("scanning");
    setScoreResult(null);
    setActionsResult(null);
    setErrorMsg(null);

    try {
      // Step 1: Score
      setStep("scoring");
      const scoreRes = await fetch("/api/score-ads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(clientId ? { clientId } : {}),
      });
      const scoreData = await scoreRes.json();

      if (!scoreData.ok) {
        setStep("error");
        setErrorMsg(`Score failed: ${scoreData.error}`);
        return;
      }

      setScoreResult({
        scored: scoreData.scored,
        total: scoreData.total,
        breakdown: scoreData.breakdown ?? { winner: 0, losing: 0, testing: 0, paused: 0 },
      });

      // Step 2: Generate actions
      setStep("generating");
      const actionsRes = await fetch("/api/generate-actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(clientId ? { clientId } : {}),
      });
      const actionsData = await actionsRes.json();

      if (!actionsData.ok) {
        setStep("error");
        setErrorMsg(`Actions failed: ${actionsData.error}`);
        return;
      }

      setActionsResult({
        generated: actionsData.generated,
        skipped: actionsData.skipped,
        total: actionsData.total,
        priorityBreakdown: actionsData.priorityBreakdown ?? { high: 0, medium: 0, low: 0 },
        topActions: actionsData.topActions ?? [],
      });

      setStep("done");
      router.refresh();

      // Scroll to results after a brief delay for render
      setTimeout(() => {
        resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
    } catch (err) {
      setStep("error");
      setErrorMsg(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  const isProcessing = step === "scanning" || step === "scoring" || step === "generating";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Button + progress */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button
          onClick={handleClick}
          disabled={isProcessing}
          style={{
            padding: "10px 20px",
            borderRadius: 10,
            border: "none",
            background: isProcessing ? "#3f3f46" : "#18181b",
            color: "#fff",
            fontSize: 14,
            fontWeight: 600,
            cursor: isProcessing ? "not-allowed" : "pointer",
            transition: "all 0.15s",
          }}
        >
          {stepLabels[step]}
        </button>

        {isProcessing && (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div
              style={{
                width: 16,
                height: 16,
                border: "2px solid #e4e4e7",
                borderTopColor: "#18181b",
                borderRadius: "50%",
                animation: "spin 0.8s linear infinite",
              }}
            />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}
      </div>

      {/* Error */}
      {step === "error" && errorMsg && (
        <div
          style={{
            padding: 12,
            borderRadius: 10,
            background: "#fef2f2",
            border: "1px solid #fecaca",
            fontSize: 13,
            color: "#991b1b",
          }}
        >
          {errorMsg}
        </div>
      )}

      {/* Results summary */}
      {(scoreResult || actionsResult) && (
        <div
          ref={resultsRef}
          style={{
            border: "1px solid #e4e4e7",
            borderRadius: 16,
            padding: 20,
            background: "#fff",
          }}
        >
          {/* Scoring results */}
          {scoreResult && (
            <div style={{ marginBottom: actionsResult ? 20 : 0 }}>
              <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 12, color: "#18181b" }}>
                {scoreResult.scored} ads scored
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <StatChip
                  icon="trophy"
                  label="Winners"
                  value={scoreResult.breakdown.winner}
                  color="#166534"
                  bg="#dcfce7"
                />
                <StatChip
                  icon="warning"
                  label="Losing"
                  value={scoreResult.breakdown.losing}
                  color="#991b1b"
                  bg="#fee2e2"
                />
                <StatChip
                  icon="lab"
                  label="Testing"
                  value={scoreResult.breakdown.testing}
                  color="#92400e"
                  bg="#fef3c7"
                />
                {scoreResult.breakdown.paused > 0 && (
                  <StatChip
                    icon="pause"
                    label="Paused"
                    value={scoreResult.breakdown.paused}
                    color="#71717a"
                    bg="#f4f4f5"
                  />
                )}
              </div>
            </div>
          )}

          {/* Actions results */}
          {actionsResult && (
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 12, color: "#18181b" }}>
                {actionsResult.generated} actions generated
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
                <StatChip
                  icon="fire"
                  label="High priority"
                  value={actionsResult.priorityBreakdown.high}
                  color="#991b1b"
                  bg="#fee2e2"
                />
                <StatChip
                  icon="alert"
                  label="Medium"
                  value={actionsResult.priorityBreakdown.medium}
                  color="#92400e"
                  bg="#fef3c7"
                />
                <StatChip
                  icon="info"
                  label="Low"
                  value={actionsResult.priorityBreakdown.low}
                  color="#71717a"
                  bg="#f4f4f5"
                />
              </div>

              {/* Top Actions */}
              {actionsResult.topActions.length > 0 && (
                <div>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: "#18181b",
                      marginBottom: 8,
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                    }}
                  >
                    Top Actions Right Now
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {actionsResult.topActions.slice(0, 3).map((action, i) => {
                      const pColors: Record<string, { bg: string; text: string; border: string }> = {
                        high: { bg: "#fef2f2", text: "#991b1b", border: "#fecaca" },
                        medium: { bg: "#fffbeb", text: "#92400e", border: "#fde68a" },
                        low: { bg: "#fafafa", text: "#71717a", border: "#e4e4e7" },
                      };
                      const pc = pColors[action.priority] ?? pColors.low;

                      return (
                        <div
                          key={i}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            padding: "8px 12px",
                            borderRadius: 10,
                            border: `1px solid ${pc.border}`,
                            background: pc.bg,
                          }}
                        >
                          <span
                            style={{
                              width: 22,
                              height: 22,
                              borderRadius: "50%",
                              background: pc.text,
                              color: "#fff",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: 12,
                              fontWeight: 700,
                              flexShrink: 0,
                            }}
                          >
                            {i + 1}
                          </span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: "#18181b" }}>
                              {action.action}
                            </div>
                            <div style={{ fontSize: 12, color: "#71717a", marginTop: 1 }}>
                              {action.ad_name} &mdash; {action.problem}
                            </div>
                          </div>
                          <span
                            style={{
                              padding: "2px 8px",
                              borderRadius: 999,
                              fontSize: 11,
                              fontWeight: 600,
                              background: pc.text,
                              color: "#fff",
                              textTransform: "uppercase",
                              flexShrink: 0,
                            }}
                          >
                            {action.priority}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatChip({
  icon,
  label,
  value,
  color,
  bg,
}: {
  icon: string;
  label: string;
  value: number;
  color: string;
  bg: string;
}) {
  const icons: Record<string, string> = {
    trophy: "\u{1F3C6}",
    warning: "\u26A0\uFE0F",
    lab: "\u{1F9EA}",
    pause: "\u23F8\uFE0F",
    fire: "\u{1F525}",
    alert: "\u{1F7E1}",
    info: "\u26AA",
  };

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "6px 12px",
        borderRadius: 999,
        background: bg,
        color: color,
        fontSize: 13,
        fontWeight: 600,
      }}
    >
      <span style={{ fontSize: 14 }}>{icons[icon] ?? ""}</span>
      <span>{value}</span>
      <span style={{ fontWeight: 400 }}>{label}</span>
    </div>
  );
}
