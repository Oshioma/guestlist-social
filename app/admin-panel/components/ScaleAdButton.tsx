"use client";

import { useState } from "react";
import Link from "next/link";

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success"; queueId: number; deduped: boolean }
  | { kind: "error"; message: string };

export default function ScaleAdButton({
  adId,
  hasAdsetMetaId,
}: {
  adId: number;
  hasAdsetMetaId: boolean;
}) {
  const [state, setState] = useState<State>({ kind: "idle" });

  async function handleClick() {
    setState({ kind: "loading" });
    try {
      const res = await fetch("/api/queue-budget-bump", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adId }),
      });
      const data = await res.json();
      if (!data.ok) {
        setState({ kind: "error", message: data.error ?? "Failed" });
      } else {
        setState({
          kind: "success",
          queueId: Number(data.queueId),
          deduped: Boolean(data.deduped),
        });
      }
    } catch (err) {
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : "Network error",
      });
    }
  }

  if (state.kind === "success") {
    return (
      <Link
        href="/app/meta-queue"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "4px 12px",
          borderRadius: 999,
          fontSize: 11,
          fontWeight: 700,
          background: "#166534",
          color: "#fff",
          textDecoration: "none",
          textTransform: "uppercase",
          letterSpacing: "0.04em",
        }}
      >
        {state.deduped ? "Already queued ↗" : "Queued ↗"}
      </Link>
    );
  }

  const disabled = state.kind === "loading" || !hasAdsetMetaId;
  const title = !hasAdsetMetaId
    ? "Missing ad set Meta id — run a Meta sync first"
    : "Queue a +15% budget bump on this ad set. Needs approval before it hits Meta.";

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled}
        title={title}
        style={{
          padding: "4px 12px",
          borderRadius: 999,
          fontSize: 11,
          fontWeight: 700,
          background: disabled ? "#a7f3d0" : "#166534",
          color: "#fff",
          border: "none",
          cursor: disabled ? "not-allowed" : "pointer",
          textTransform: "uppercase",
          letterSpacing: "0.04em",
        }}
      >
        {state.kind === "loading" ? "Queuing…" : "Scale"}
      </button>
      {state.kind === "error" && (
        <span style={{ fontSize: 11, color: "#991b1b" }}>{state.message}</span>
      )}
    </span>
  );
}
