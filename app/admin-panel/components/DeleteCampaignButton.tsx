"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Props = {
  campaignId: string;
  campaignName: string;
  onDelete: () => Promise<void>;
};

export default function DeleteCampaignButton({
  campaignId,
  campaignName,
  onDelete,
}: Props) {
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        style={{
          padding: "8px 12px",
          borderRadius: 10,
          border: "1px solid #fecaca",
          background: "#fff",
          color: "#991b1b",
          fontSize: 13,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        Delete
      </button>
    );
  }

  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
      <span style={{ fontSize: 12, color: "#991b1b" }}>
        Delete &ldquo;{campaignName}&rdquo;?
      </span>
      <button
        type="button"
        disabled={isPending}
        onClick={() => {
          startTransition(async () => {
            await onDelete();
            router.refresh();
          });
        }}
        style={{
          padding: "5px 10px",
          borderRadius: 6,
          border: "none",
          background: "#991b1b",
          color: "#fff",
          fontSize: 12,
          fontWeight: 600,
          cursor: isPending ? "wait" : "pointer",
        }}
      >
        {isPending ? "..." : "Yes, delete"}
      </button>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        style={{
          padding: "5px 10px",
          borderRadius: 6,
          border: "1px solid #e4e4e7",
          background: "#fff",
          color: "#71717a",
          fontSize: 12,
          cursor: "pointer",
        }}
      >
        Cancel
      </button>
    </div>
  );
}
