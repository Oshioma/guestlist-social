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

export default function AiSuggestButton({
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
    sources: Record<string, boolean>;
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
          setResult({
            suggestion: data.suggestion,
            reasoning: data.reasoning,
            sources: data.sourcesUsed ?? {},
          });
        }
      } catch {
        setError("Network error");
      }
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <button
        type="button"
        onClick={handleSuggest}
        disabled={isPending}
        style={{
          padding: "4px 10px",
          borderRadius: 6,
          border: "none",
          background: isPending
            ? "#e4e4e7"
            : "linear-gradient(135deg, #4338ca 0%, #7c3aed 100%)",
          color: isPending ? "#a1a1aa" : "#fff",
          fontSize: 11,
          fontWeight: 700,
          cursor: isPending ? "wait" : "pointer",
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          alignSelf: "flex-start",
        }}
      >
        {isPending ? (
          "AI thinking..."
        ) : (
          <>
            <span style={{ fontSize: 13 }}>&#9733;</span> AI Suggest
          </>
        )}
      </button>

      {error && (
        <div
          style={{
            fontSize: 12,
            color: "#991b1b",
            background: "#fef2f2",
            border: "1px solid #fecaca",
            borderRadius: 8,
            padding: "8px 10px",
          }}
        >
          {error}
        </div>
      )}

      {result && (
        <div
          style={{
            border: "1px solid #e0e7ff",
            borderRadius: 10,
            background: "#eef2ff",
            padding: "10px 12px",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 10,
              fontWeight: 700,
              color: "#4338ca",
              textTransform: "uppercase",
              letterSpacing: "0.04em",
            }}
          >
            <span style={{ fontSize: 12 }}>&#9733;</span>
            AI suggestion
            {result.sources.internal && (
              <span style={sourceTag("#dbeafe", "#1e40af")}>Internal data</span>
            )}
            {result.sources.metaAdLibrary && (
              <span style={sourceTag("#f3e8ff", "#6b21a8")}>Ad Library</span>
            )}
            {result.sources.clientWebsite && (
              <span style={sourceTag("#fef3c7", "#92400e")}>Website</span>
            )}
          </div>

          <div style={{ fontSize: 13, color: "#18181b", lineHeight: 1.5 }}>
            {result.suggestion}
          </div>

          {result.reasoning && (
            <div style={{ fontSize: 11, color: "#6b7280", lineHeight: 1.4, fontStyle: "italic" }}>
              {result.reasoning}
            </div>
          )}

          <div style={{ display: "flex", gap: 6 }}>
            <button
              type="button"
              onClick={() => {
                onApply(result.suggestion);
                setResult(null);
              }}
              style={{
                padding: "5px 12px",
                borderRadius: 6,
                border: "none",
                background: "#4338ca",
                color: "#fff",
                fontSize: 11,
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
                padding: "5px 12px",
                borderRadius: 6,
                border: "1px solid #c7d2fe",
                background: "#fff",
                color: "#4338ca",
                fontSize: 11,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Try again
            </button>
            <button
              type="button"
              onClick={() => setResult(null)}
              style={{
                padding: "5px 12px",
                borderRadius: 6,
                border: "1px solid #e4e4e7",
                background: "#fff",
                color: "#71717a",
                fontSize: 11,
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

function sourceTag(bg: string, color: string): React.CSSProperties {
  return {
    padding: "1px 6px",
    borderRadius: 4,
    fontSize: 9,
    fontWeight: 700,
    background: bg,
    color,
  };
}
