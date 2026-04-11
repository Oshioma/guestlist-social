"use client";

import { useTransition } from "react";
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
  const router = useRouter();

  const isPrimary = variant === "primary";

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => {
        startTransition(async () => {
          await assignCampaignToClient(String(campaignId), String(clientId));
          router.refresh();
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
