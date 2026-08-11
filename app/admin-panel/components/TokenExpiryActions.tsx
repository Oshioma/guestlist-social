"use client";

import { useState, useTransition } from "react";
import { syncAllClients } from "../lib/meta-sync-action";

// Action buttons for the expired-token banner. Reconnecting is what actually
// clears expired publish tokens (a Facebook re-login per account, done from
// the Teams page where each account is connected). "Sync ad data" pulls the latest
// campaign/insights data — handy, but it does not refresh publish tokens, so
// it's the secondary action.
export default function TokenExpiryActions() {
  const [isPending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  function handleSync() {
    setMsg(null);
    startTransition(async () => {
      try {
        const res = await syncAllClients();
        setOk(Boolean(res?.ok));
        setMsg(
          res?.ok
            ? res.log?.[0] ?? "Ad data synced."
            : `Sync failed: ${res?.error ?? "unknown error"}`
        );
      } catch (e) {
        setOk(false);
        setMsg(e instanceof Error ? e.message : "Sync failed.");
      }
    });
  }

  return (
    <div
      style={{
        display: "flex",
        gap: 8,
        marginTop: 8,
        flexWrap: "wrap",
        alignItems: "center",
      }}
    >
      <a
        href="/proofer/teams"
        style={{
          padding: "7px 13px",
          borderRadius: 8,
          background: "#18181b",
          color: "#fff",
          fontSize: 12,
          fontWeight: 700,
          textDecoration: "none",
          display: "inline-block",
        }}
      >
        Reconnect accounts &rarr;
      </a>
      <button
        type="button"
        onClick={handleSync}
        disabled={isPending}
        style={{
          padding: "7px 13px",
          borderRadius: 8,
          background: "#fff",
          border: "1px solid #e0e0e4",
          color: "#18181b",
          fontSize: 12,
          fontWeight: 700,
          cursor: isPending ? "wait" : "pointer",
        }}
      >
        {isPending ? "Syncing ad data…" : "Sync ad data now"}
      </button>
      {msg && (
        <span style={{ fontSize: 12, color: ok ? "#166534" : "#991b1b" }}>
          {msg}
        </span>
      )}
    </div>
  );
}
