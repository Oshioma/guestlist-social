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
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button
          onClick={handleClick}
          disabled={loading}
          style={{
            padding: "10px 20px",
            borderRadius: 10,
            border: "1px solid #18181b",
            background: loading ? "#f4f4f5" : "#18181b",
            color: loading ? "#71717a" : "#fff",
            fontSize: 14,
            fontWeight: 600,
            cursor: loading ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "Working…" : "Run engine & save decisions"}
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
      <p style={{ fontSize: 12, color: "#71717a", margin: 0 }}>
        Looks at every ad, decides what to pause or scale, and adds the safe ones to your action queue for approval.
      </p>
    </div>
  );
}
