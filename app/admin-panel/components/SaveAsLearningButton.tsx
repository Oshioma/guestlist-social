"use client";

import { useState } from "react";

type Props = {
  actionId: string;
  adId: number;
  problem: string;
  resultSummary?: string | null;
  outcome?: string | null;
  actionText: string;
};

export default function SaveAsLearningButton({
  actionId,
  adId,
  problem,
  resultSummary,
  outcome,
  actionText,
}: Props) {
  const [state, setState] = useState<"idle" | "open" | "saving" | "saved" | "error">("idle");
  const [changeMade, setChangeMade] = useState(actionText);
  const [result, setResult] = useState(resultSummary ?? "");

  if (state === "saved") {
    return (
      <span
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: "#166534",
          padding: "3px 10px",
          borderRadius: 6,
          background: "#f0fdf4",
          border: "1px solid #bbf7d0",
        }}
      >
        Saved as learning
      </span>
    );
  }

  if (state === "idle") {
    return (
      <button
        type="button"
        onClick={() => setState("open")}
        style={{
          padding: "3px 10px",
          borderRadius: 6,
          border: "1px solid #e4e4e7",
          background: "#fff",
          color: "#52525b",
          fontSize: 11,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        Save as learning
      </button>
    );
  }

  async function handleSave() {
    setState("saving");
    try {
      const res = await fetch("/api/save-learning", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actionId,
          adId,
          problem,
          changeMade,
          result,
          outcome: outcome ?? "neutral",
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        setState("error");
      } else {
        setState("saved");
      }
    } catch {
      setState("error");
    }
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        padding: "8px 10px",
        background: "#fafafa",
        border: "1px solid #e4e4e7",
        borderRadius: 8,
        width: "100%",
        maxWidth: 540,
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 600, color: "#71717a", textTransform: "uppercase", letterSpacing: "0.04em" }}>
        Save as learning
      </div>
      <input
        type="text"
        placeholder="What change was made?"
        value={changeMade}
        onChange={(e) => setChangeMade(e.target.value)}
        style={{
          padding: "4px 8px",
          borderRadius: 6,
          border: "1px solid #e4e4e7",
          fontSize: 12,
          width: "100%",
        }}
      />
      <input
        type="text"
        placeholder="What was the result?"
        value={result}
        onChange={(e) => setResult(e.target.value)}
        style={{
          padding: "4px 8px",
          borderRadius: 6,
          border: "1px solid #e4e4e7",
          fontSize: 12,
          width: "100%",
        }}
      />
      <div style={{ display: "flex", gap: 6 }}>
        <button
          type="button"
          onClick={handleSave}
          disabled={state === "saving" || !changeMade.trim()}
          style={{
            padding: "4px 12px",
            borderRadius: 6,
            border: "none",
            background: "#18181b",
            color: "#fff",
            fontSize: 11,
            fontWeight: 600,
            cursor: state === "saving" ? "not-allowed" : "pointer",
            opacity: state === "saving" ? 0.6 : 1,
          }}
        >
          {state === "saving" ? "Saving..." : "Save"}
        </button>
        <button
          type="button"
          onClick={() => setState("idle")}
          style={{
            padding: "4px 10px",
            borderRadius: 6,
            border: "1px solid #e4e4e7",
            background: "#fff",
            color: "#71717a",
            fontSize: 11,
            cursor: "pointer",
          }}
        >
          Cancel
        </button>
        {state === "error" && (
          <span style={{ fontSize: 11, color: "#991b1b", alignSelf: "center" }}>
            Failed to save
          </span>
        )}
      </div>
    </div>
  );
}
