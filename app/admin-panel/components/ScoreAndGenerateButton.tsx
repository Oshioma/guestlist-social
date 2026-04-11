"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ScoreAndGenerateButton({
  clientId,
}: {
  clientId?: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setResult(null);

    try {
      // Step 1: Score all ads
      const scoreRes = await fetch("/api/score-ads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(clientId ? { clientId } : {}),
      });
      const scoreData = await scoreRes.json();

      if (!scoreData.ok) {
        setResult(`Score failed: ${scoreData.error}`);
        setLoading(false);
        return;
      }

      // Step 2: Generate actions
      const actionsRes = await fetch("/api/generate-actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(clientId ? { clientId } : {}),
      });
      const actionsData = await actionsRes.json();

      if (!actionsData.ok) {
        setResult(`Actions failed: ${actionsData.error}`);
        setLoading(false);
        return;
      }

      setResult(
        `Scored ${scoreData.scored} ads, generated ${actionsData.generated} actions`
      );
      router.refresh();
    } catch (err) {
      setResult(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <button
        onClick={handleClick}
        disabled={loading}
        style={{
          padding: "8px 16px",
          borderRadius: 8,
          border: "1px solid #e4e4e7",
          background: loading ? "#f4f4f5" : "#18181b",
          color: loading ? "#71717a" : "#fff",
          fontSize: 13,
          fontWeight: 600,
          cursor: loading ? "not-allowed" : "pointer",
        }}
      >
        {loading ? "Scoring..." : "Score Ads & Generate Actions"}
      </button>
      {result && (
        <span
          style={{
            fontSize: 12,
            color: result.includes("failed") ? "#991b1b" : "#166534",
          }}
        >
          {result}
        </span>
      )}
    </div>
  );
}
