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

export function AiIcon({
  onClick,
  loading,
}: {
  onClick: () => void;
  loading: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      title="AI suggest"
      style={{
        width: 22,
        height: 22,
        borderRadius: "50%",
        border: "none",
        background: loading
          ? "#c7d2fe"
          : "linear-gradient(135deg, #4338ca 0%, #7c3aed 100%)",
        color: "#fff",
        fontSize: 11,
        fontWeight: 700,
        cursor: loading ? "wait" : "pointer",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 0,
        flexShrink: 0,
        transition: "background 200ms",
      }}
    >
      {loading ? "..." : "AI"}
    </button>
  );
}

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
      <AiIcon onClick={handleSuggest} loading={isPending} />

      <div
        style={{
          overflow: "hidden",
          maxHeight: showPanel ? height + 20 : 0,
          opacity: visible ? 1 : 0,
          transition: "max-height 350ms ease, opacity 300ms ease 50ms",
        }}
      >
        <div ref={contentRef}>
          {showPanel && (
            <div
              style={{
                marginTop: 8,
                marginBottom: 4,
                padding: "14px 16px",
                borderRadius: 12,
                background: error ? "#fef2f2" : "#eef2ff",
                border: `1px solid ${error ? "#fecaca" : "#e0e7ff"}`,
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              {error && (
                <div style={{ fontSize: 14, color: "#991b1b", lineHeight: 1.5 }}>
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
                  <div style={{ fontSize: 17, fontWeight: 600, color: "#18181b", lineHeight: 1.4 }}>
                    {result.suggestion}
                  </div>
                  {result.reasoning && (
                    <div
                      style={{
                        fontSize: 14,
                        color: "#52525b",
                        fontStyle: "italic",
                        lineHeight: 1.6,
                      }}
                    >
                      {result.reasoning}
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
                    <button
                      type="button"
                      onClick={() => {
                        onApply(result.suggestion);
                        handleDismiss();
                      }}
                      style={{
                        padding: "6px 14px",
                        borderRadius: 6,
                        border: "none",
                        background: "#4338ca",
                        color: "#fff",
                        fontSize: 12,
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
                        padding: "6px 14px",
                        borderRadius: 6,
                        border: "1px solid #c7d2fe",
                        background: "#fff",
                        color: "#4338ca",
                        fontSize: 12,
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
                        padding: "6px 14px",
                        borderRadius: 6,
                        border: "1px solid #e4e4e7",
                        background: "#fff",
                        color: "#71717a",
                        fontSize: 12,
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
