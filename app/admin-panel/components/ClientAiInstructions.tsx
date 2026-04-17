"use client";

import { useState, useTransition } from "react";

type Props = {
  clientId: string;
  initialInstructions: string;
};

export default function ClientAiInstructions({
  clientId,
  initialInstructions,
}: Props) {
  const [instructions, setInstructions] = useState(initialInstructions);
  const [isPending, startTransition] = useTransition();
  const [genPending, setGenPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = instructions !== initialInstructions;

  function handleSave() {
    setSaved(false);
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/ai-generate-client-instructions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientId, manualInstructions: instructions }),
        });
        const data = await res.json();
        if (data.ok) {
          setSaved(true);
        } else {
          setError(data.error);
        }
      } catch {
        setError("Could not save");
      }
    });
  }

  async function handleGenerate() {
    setGenPending(true);
    setError(null);
    try {
      const res = await fetch("/api/ai-generate-client-instructions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId }),
      });
      const data = await res.json();
      if (data.ok) {
        setInstructions(data.instructions);
        setSaved(true);
      } else {
        setError(data.error);
      }
    } catch {
      setError("Network error");
    } finally {
      setGenPending(false);
    }
  }

  return (
    <div
      style={{
        maxWidth: 720,
        background: "#fff",
        border: "1px solid #e4e4e7",
        borderRadius: 16,
        padding: 24,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#18181b" }}>
            AI instructions for this client
          </h2>
          <p style={{ margin: "4px 0 0", fontSize: 12, color: "#71717a" }}>
            These rules guide all AI-generated copy, audiences, and suggestions for this client.
          </p>
        </div>
        <button
          type="button"
          onClick={handleGenerate}
          disabled={genPending}
          style={{
            padding: "6px 14px",
            borderRadius: 8,
            border: "none",
            background: genPending
              ? "#c7d2fe"
              : "linear-gradient(135deg, #4338ca 0%, #7c3aed 100%)",
            color: "#fff",
            fontSize: 12,
            fontWeight: 700,
            cursor: genPending ? "wait" : "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          {genPending ? "Generating..." : "★ AI Generate"}
        </button>
      </div>

      <textarea
        value={instructions}
        onChange={(e) => { setInstructions(e.target.value); setSaved(false); }}
        placeholder={"AI will generate 5 rules based on this client's profile, industry, and website.\n\nOr write your own:\n• Always mention free delivery\n• Tone: casual, never corporate\n• Target 25-45 professionals\n• Lead with craft cocktails, not generic \"drinks\"\n• Include FOMO — \"this weekend\", \"limited seats\""}
        style={{
          width: "100%",
          minHeight: 160,
          padding: "12px 14px",
          borderRadius: 12,
          border: "1px solid #e4e4e7",
          fontSize: 14,
          fontFamily: "inherit",
          color: "#18181b",
          background: "#fafafa",
          resize: "vertical",
          boxSizing: "border-box",
          lineHeight: 1.7,
        }}
      />

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
        {dirty && (
          <button
            type="button"
            onClick={handleSave}
            disabled={isPending}
            style={{
              padding: "8px 16px",
              borderRadius: 8,
              border: "none",
              background: isPending ? "#d4d4d8" : "#18181b",
              color: isPending ? "#a1a1aa" : "#fff",
              fontSize: 13,
              fontWeight: 600,
              cursor: isPending ? "wait" : "pointer",
            }}
          >
            {isPending ? "Saving..." : "Save instructions"}
          </button>
        )}
        {error && (
          <span style={{ fontSize: 12, color: "#991b1b" }}>{error}</span>
        )}
        {saved && !dirty && (
          <span style={{ fontSize: 12, color: "#166534" }}>Saved</span>
        )}
      </div>
    </div>
  );
}
