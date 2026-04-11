"use client";

import { useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { assignCampaignToClient } from "../lib/campaign-actions";

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
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<"idle" | "done" | "error">("idle");
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
        disabled={isPending}
        onClick={() => {
          setStatus("idle");
          startTransition(async () => {
            try {
              await assignCampaignToClient(String(campaignId), String(clientId));
              setStatus("done");
              router.refresh();
            } catch {
              setStatus("error");
            }
          });
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
          cursor: isPending ? "wait" : "pointer",
          opacity: isPending ? 0.6 : 1,
        }}
      >
        {isPending ? "Assigning..." : label}
      </button>
      {status === "error" && (
        <span style={{ fontSize: 11, color: "#dc2626" }}>
          Failed to assign. Try again.
        </span>
      )}
    </div>
  );
}
