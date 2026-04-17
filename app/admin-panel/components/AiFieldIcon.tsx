"use client";

import { useState, useTransition } from "react";

type Props = {
  clientId: string;
  field: "audience" | "headline" | "body" | "cta" | "budget" | "creative";
  objective?: string;
  budget?: number;
  campaignName?: string;
  onApply: (value: string) => void;
};

export default function AiFieldIcon({
  clientId,
  field,
  objective,
  budget,
  campaignName,
  onApply,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{
    suggestion: string;
    reasoning: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleSuggest() {
    setError(null);
    setResult(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/ai-suggest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientId, field, objective, budget, campaignName }),
        });
        const data = await res.json();
        if (!data.ok) {
          setError(data.error);
        } else {
          setResult({ suggestion: data.suggestion, reasoning: data.reasoning });
        }
      } catch {
        setError("Network error");
      }
    });
  }

  return (
    <span style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
      <button
        type="button"
        onClick={handleSuggest}
        disabled={isPending}
        title={`AI suggest ${field}`}
        style={{
          width: 22,
          height: 22,
          borderRadius: "50%",
          border: "none",
          background: isPending
            ? "#c7d2fe"
            : "linear-gradient(135deg, #4338ca 0%, #7c3aed 100%)",
          color: "#fff",
          fontSize: 11,
          fontWeight: 700,
          cursor: isPending ? "wait" : "pointer",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 0,
          flexShrink: 0,
        }}
      >
        {isPending ? "..." : "AI"}
      </button>

      {(result || error) && (
        <div
          style={{
            position: "absolute",
            top: 28,
            left: 0,
            zIndex: 50,
            width: 320,
            padding: "10px 12px",
            borderRadius: 10,
            background: error ? "#fef2f2" : "#eef2ff",
            border: `1px solid ${error ? "#fecaca" : "#e0e7ff"}`,
            boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          {error && (
            <div style={{ fontSize: 12, color: "#991b1b" }}>{error}</div>
          )}
          {result && (
            <>
              <div style={{ fontSize: 12, color: "#18181b", lineHeight: 1.5 }}>
                {result.suggestion}
              </div>
              {result.reasoning && (
                <div style={{ fontSize: 11, color: "#6b7280", fontStyle: "italic", lineHeight: 1.4 }}>
                  {result.reasoning}
                </div>
              )}
              <div style={{ display: "flex", gap: 4 }}>
                <button
                  type="button"
                  onClick={() => { onApply(result.suggestion); setResult(null); }}
                  style={{
                    padding: "3px 8px",
                    borderRadius: 5,
                    border: "none",
                    background: "#4338ca",
                    color: "#fff",
                    fontSize: 10,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Use this
                </button>
                <button
                  type="button"
                  onClick={handleSuggest}
                  disabled={isPending}
                  style={{
                    padding: "3px 8px",
                    borderRadius: 5,
                    border: "1px solid #c7d2fe",
                    background: "#fff",
                    color: "#4338ca",
                    fontSize: 10,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Retry
                </button>
              </div>
            </>
          )}
          <button
            type="button"
            onClick={() => { setResult(null); setError(null); }}
            style={{
              position: "absolute",
              top: 4,
              right: 6,
              background: "none",
              border: "none",
              color: "#a1a1aa",
              fontSize: 14,
              cursor: "pointer",
              lineHeight: 1,
            }}
          >
            x
          </button>
        </div>
      )}
    </span>
  );
}
