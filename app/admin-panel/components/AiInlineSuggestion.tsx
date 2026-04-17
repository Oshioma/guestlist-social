"use client";

import { useState } from "react";

type Props = {
  suggestion: string | null;
  reasoning: string | null;
  loading: boolean;
  onApply?: (value: string) => void;
};

export default function AiInlineSuggestion({
  suggestion,
  reasoning,
  loading,
  onApply,
}: Props) {
  const [showTooltip, setShowTooltip] = useState(false);

  if (loading) {
    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          fontSize: 12,
          color: "#a5b4fc",
          opacity: 0.7,
        }}
      >
        <span style={{ fontSize: 12 }}>&#9733;</span>
        thinking...
      </span>
    );
  }

  if (!suggestion) return null;

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        animation: "fadeIn 400ms ease",
      }}
    >
      <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }`}</style>

      <button
        type="button"
        onClick={() => onApply?.(suggestion)}
        title="Click to use this suggestion"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          padding: "3px 8px",
          borderRadius: 6,
          border: "none",
          background: "#eef2ff",
          color: "#4338ca",
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer",
          transition: "background 150ms",
        }}
      >
        <span style={{ fontSize: 11 }}>&#9733;</span>
        {suggestion}
      </button>

      {reasoning && (
        <span
          style={{ position: "relative", display: "inline-flex" }}
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
        >
          <span
            style={{
              width: 16,
              height: 16,
              borderRadius: "50%",
              background: "#e0e7ff",
              color: "#4338ca",
              fontSize: 10,
              fontWeight: 700,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "help",
            }}
          >
            i
          </span>

          {showTooltip && (
            <span
              style={{
                position: "absolute",
                bottom: 24,
                left: "50%",
                transform: "translateX(-50%)",
                width: 280,
                padding: "8px 10px",
                borderRadius: 8,
                background: "#1e1b4b",
                color: "#e0e7ff",
                fontSize: 12,
                lineHeight: 1.5,
                zIndex: 100,
                boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
                pointerEvents: "none",
              }}
            >
              {reasoning}
            </span>
          )}
        </span>
      )}
    </span>
  );
}
