"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Result = {
  generated: number;
  source_learnings?: number;
  breakdown?: Record<string, number>;
  message?: string;
};

export default function GenerateGlobalLearningsButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/generate-global-learnings", {
        method: "POST",
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error ?? "Unknown error");
      } else {
        setResult(data);
        router.refresh();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <button
          onClick={handleClick}
          disabled={loading}
          style={{
            padding: "8px 16px",
            borderRadius: 8,
            border: "1px solid #18181b",
            background: "#18181b",
            color: "#fff",
            fontSize: 13,
            fontWeight: 600,
            cursor: loading ? "not-allowed" : "pointer",
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? "Updating…" : "Update the playbook"}
        </button>

        {result && (
          <span style={{ fontSize: 12, color: "#166534", fontWeight: 500 }}>
            Found {result.generated} winning pattern{result.generated === 1 ? "" : "s"}
            {result.source_learnings !== undefined &&
              ` from ${result.source_learnings} past results`}
          </span>
        )}

        {error && (
          <span style={{ fontSize: 12, color: "#991b1b" }}>Error: {error}</span>
        )}
      </div>
      <p style={{ fontSize: 12, color: "#71717a", margin: 0 }}>
        Looks at every client&rsquo;s past results, finds what reliably worked, and saves it to the playbook the engine pulls from.
      </p>
    </div>
  );
}
