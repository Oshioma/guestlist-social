"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function CreateActionFromSuggestionButton({
  clientId,
  campaignId,
  title,
  description,
  priority,
}: {
  clientId: string;
  campaignId: string;
  title: string;
  description: string;
  priority: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/create-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, campaignId, title, description, priority }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error || "Failed to create action");
      } else {
        setDone(true);
        router.refresh();
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <button
        type="button"
        disabled={loading || done}
        onClick={handleClick}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "7px 11px",
          borderRadius: 9,
          border: "1px solid #e4e4e7",
          background: done ? "#f4f4f5" : "#18181b",
          color: done ? "#71717a" : "#fff",
          fontSize: 12,
          fontWeight: 600,
          cursor: loading || done ? "default" : "pointer",
        }}
      >
        {done ? "Action created" : loading ? "Creating..." : "Create action"}
      </button>

      {error ? (
        <div style={{ fontSize: 12, color: "#b91c1c" }}>{error}</div>
      ) : null}
    </div>
  );
}
