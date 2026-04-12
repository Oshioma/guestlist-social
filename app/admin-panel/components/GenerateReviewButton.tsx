"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function GenerateReviewButton({
  clientId,
}: {
  clientId: string | number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/generate-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: clientId }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error ?? "Failed to generate review");
        return;
      }
      router.push(`/app/clients/${clientId}/reviews/${data.review_id}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <button
        onClick={handleClick}
        disabled={busy}
        style={{
          padding: "8px 14px",
          borderRadius: 10,
          background: busy ? "#f4f4f5" : "#18181b",
          color: busy ? "#71717a" : "#fff",
          border: "1px solid #18181b",
          fontSize: 13,
          fontWeight: 600,
          cursor: busy ? "default" : "pointer",
        }}
      >
        {busy ? "Building this week's review…" : "Build this week's review"}
      </button>
      {error && (
        <span style={{ fontSize: 12, color: "#991b1b" }}>{error}</span>
      )}
    </div>
  );
}
