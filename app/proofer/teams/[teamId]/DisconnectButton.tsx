"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { disconnectClientPlatform } from "@/lib/auth/team-actions";

// Small "Disconnect" control shown next to a connected platform on the team
// page. Lets a manager remove a stored connection that shouldn't be there
// (e.g. a Facebook Page that isn't really this account's) so the status stops
// claiming the account is connected.
export function DisconnectButton({
  teamId,
  clientId,
  platform,
  label,
  iconOnly = false,
}: {
  teamId: string;
  clientId: number;
  platform: "facebook" | "instagram";
  label: string;
  // Compact mode: a subtle ✕ (used inline next to a connected handle) instead
  // of the full red "Disconnect X" button.
  iconOnly?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function handleClick() {
    if (
      !window.confirm(
        `Disconnect ${label} for this account? Nothing is posted or deleted on ${label} — this only removes the stored connection here. You can reconnect anytime.`
      )
    ) {
      return;
    }
    setErr(null);
    startTransition(async () => {
      const res = await disconnectClientPlatform(teamId, String(clientId), platform);
      if (!res.ok) {
        setErr(res.error ?? "Could not disconnect.");
        return;
      }
      router.refresh();
    });
  }

  if (iconOnly) {
    return (
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        title={err ?? `Disconnect ${label}`}
        aria-label={`Disconnect ${label}`}
        style={{
          background: "transparent",
          color: err ? "#b91c1c" : "#a1a1aa",
          border: "none",
          borderRadius: 6,
          width: 22,
          height: 22,
          display: "grid",
          placeItems: "center",
          fontSize: 13,
          lineHeight: 1,
          cursor: pending ? "wait" : "pointer",
        }}
      >
        {pending ? "·" : "✕"}
      </button>
    );
  }

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        title={`Remove the stored ${label} connection for this account`}
        style={{
          background: "transparent",
          color: "#b91c1c",
          border: "1px solid #fca5a5",
          borderRadius: 8,
          padding: "7px 10px",
          fontSize: 12,
          fontWeight: 600,
          cursor: pending ? "wait" : "pointer",
          whiteSpace: "nowrap",
        }}
      >
        {pending ? "Disconnecting…" : `Disconnect ${label}`}
      </button>
      {err && <span style={{ fontSize: 11, color: "#b91c1c" }}>{err}</span>}
    </span>
  );
}
