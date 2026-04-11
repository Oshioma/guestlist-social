"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AssignCampaignButton({
  campaignId,
  clientId,
  label,
  variant = "primary",
}: {
  campaignId: string | number;
  clientId: string | number;
  label: string;
  variant?: "primary" | "secondary";
}) {
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const router = useRouter();

  const isPrimary = variant === "primary";

  if (status === "done") {
    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          padding: "6px 12px",
          borderRadius: 8,
          background: "#f0fdf4",
          color: "#166534",
          border: "1px solid #bbf7d0",
          fontSize: 12,
          fontWeight: 600,
        }}
      >
        Assigned
      </span>
    );
  }

  return (
    <div style={{ display: "inline-flex", flexDirection: "column", gap: 4 }}>
      <button
        type="button"
        disabled={status === "loading"}
        onClick={async () => {
          setStatus("loading");
          try {
            const res = await fetch("/api/assign-campaign", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                campaignId: String(campaignId),
                clientId: String(clientId),
              }),
            });
            const data = await res.json();
            if (!res.ok || !data?.ok) {
              setStatus("error");
              return;
            }
            setStatus("done");
            router.refresh();
          } catch {
            setStatus("error");
          }
        }}
        style={{
          display: "inline-flex",
          alignItems: "center",
          padding: "6px 12px",
          borderRadius: 8,
          background: isPrimary ? "#18181b" : "#fff",
          color: isPrimary ? "#fff" : "#18181b",
          border: isPrimary ? "none" : "1px solid #e4e4e7",
          fontSize: 12,
          fontWeight: 600,
          cursor: status === "loading" ? "wait" : "pointer",
          opacity: status === "loading" ? 0.6 : 1,
        }}
      >
        {status === "loading" ? "Assigning..." : label}
      </button>
      {status === "error" && (
        <span style={{ fontSize: 11, color: "#dc2626" }}>
          Failed to assign. Try again.
        </span>
      )}
    </div>
  );
}
