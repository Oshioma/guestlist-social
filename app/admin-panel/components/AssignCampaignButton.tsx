"use client";

import { useTransition, useState } from "react";
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
  const [done, setDone] = useState(false);

  const isPrimary = variant === "primary";

  if (done) {
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
    <button
      type="button"
      disabled={isPending}
      onClick={() => {
        startTransition(async () => {
          await assignCampaignToClient(String(campaignId), String(clientId));
          setDone(true);
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
  );
}
