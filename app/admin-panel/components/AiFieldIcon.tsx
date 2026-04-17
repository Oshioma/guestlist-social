"use client";

import { useState, useTransition, useRef, useEffect } from "react";

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
  const [visible, setVisible] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    if (contentRef.current) {
      setHeight(contentRef.current.scrollHeight);
    }
  }, [result, error]);

  const showPanel = !!(result || error);

  useEffect(() => {
    if (showPanel) {
      requestAnimationFrame(() => setVisible(true));
    } else {
      setVisible(false);
    }
  }, [showPanel]);

  function handleSuggest() {
    setError(null);
    setResult(null);
    setVisible(false);
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

  function handleDismiss() {
    setVisible(false);
    setTimeout(() => {
      setResult(null);
      setError(null);
    }, 300);
  }

  return (
    <>
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
          transition: "background 200ms",
        }}
      >
        {isPending ? "..." : "AI"}
      </button>

      <div
        style={{
          overflow: "hidden",
          maxHeight: showPanel ? height + 20 : 0,
          opacity: visible ? 1 : 0,
          transition: "max-height 350ms ease, opacity 300ms ease 50ms",
          width: "100%",
          gridColumn: "1 / -1",
        }}
      >
        <div ref={contentRef}>
          {showPanel && (
            <div
              style={{
                marginTop: 8,
                padding: "12px 14px",
                borderRadius: 12,
                background: error ? "#fef2f2" : "#eef2ff",
                border: `1px solid ${error ? "#fecaca" : "#e0e7ff"}`,
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              {error && (
                <div style={{ fontSize: 12, color: "#991b1b", lineHeight: 1.5 }}>
                  {error}
                </div>
              )}
              {result && (
                <>
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: "#4338ca",
                      textTransform: "uppercase",
                      letterSpacing: "0.04em",
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    <span style={{ fontSize: 12 }}>&#9733;</span>
                    AI suggestion
                  </div>
                  <div style={{ fontSize: 13, color: "#18181b", lineHeight: 1.6 }}>
                    {result.suggestion}
                  </div>
                  {result.reasoning && (
                    <div
                      style={{
                        fontSize: 11,
                        color: "#6b7280",
                        fontStyle: "italic",
                        lineHeight: 1.5,
                      }}
                    >
                      {result.reasoning}
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      type="button"
                      onClick={() => {
                        onApply(result.suggestion);
                        handleDismiss();
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
                      onClick={handleDismiss}
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
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
