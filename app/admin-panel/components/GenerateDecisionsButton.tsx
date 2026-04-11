"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function GenerateDecisionsButton({ clientId }: { clientId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/generate-decisions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId }),
      });
      const data = await res.json();
      if (!data.ok) {
        setMessage(`Error: ${data.error}`);
      } else {
        setMessage(`${data.generated} decisions from ${data.total} ads`);
        router.refresh();
      }
    } catch {
      setMessage("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <button
        onClick={handleClick}
        disabled={loading}
        style={{
          padding: "6px 16px",
          borderRadius: 8,
          border: "1px solid #e4e4e7",
          background: loading ? "#f4f4f5" : "#18181b",
          color: loading ? "#71717a" : "#fff",
          fontSize: 13,
          fontWeight: 600,
          cursor: loading ? "not-allowed" : "pointer",
        }}
      >
        {loading ? "Scanning..." : "Generate Decisions"}
      </button>
      {message && (
        <span
          style={{
            fontSize: 12,
            color: message.startsWith("Error") ? "#991b1b" : "#166534",
          }}
        >
          {message}
        </span>
      )}
    </div>
  );
}
