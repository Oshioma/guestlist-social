"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  campaignId: string | number;
  clientId: string | number;
  label: string;
  variant?: "primary" | "secondary";
};

export default function AssignCampaignButton({
  campaignId,
  clientId,
  label,
  variant = "primary",
}: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    try {
      setLoading(true);

      const res = await fetch("/api/assign-campaign", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          campaignId: String(campaignId),
          clientId: String(clientId),
        }),
      });

      const data = await res.json();

      if (!res.ok || !data?.ok) {
        alert(data?.error || "Failed to assign campaign.");
        return;
      }

      router.refresh();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to assign campaign.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: variant === "primary" ? "8px 12px" : "7px 11px",
        borderRadius: variant === "primary" ? 10 : 9,
        background: variant === "primary" ? "#18181b" : "#fff",
        color: variant === "primary" ? "#fff" : "#18181b",
        border: variant === "primary" ? "none" : "1px solid #e4e4e7",
        cursor: loading ? "default" : "pointer",
        fontSize: variant === "primary" ? 13 : 12,
        fontWeight: 600,
        opacity: loading ? 0.7 : 1,
      }}
    >
      {loading ? "Assigning..." : label}
    </button>
  );
}
