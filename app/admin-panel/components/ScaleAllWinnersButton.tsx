"use client";

import { useState } from "react";
import Link from "next/link";

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | {
      kind: "success";
      queued: number;
      deduped: number;
      skipped: number;
    }
  | { kind: "error"; message: string };

export default function ScaleAllWinnersButton({
  clientId,
}: {
  clientId: string;
}) {
  const [state, setState] = useState<State>({ kind: "idle" });

  async function handleClick() {
    setState({ kind: "loading" });
    try {
      const res = await fetch("/api/queue-all-winners", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId }),
      });
      const data = await res.json();
      if (!data.ok) {
        setState({ kind: "error", message: data.error ?? "Failed" });
        return;
      }
      setState({
        kind: "success",
        queued: Number(data.queued ?? 0),
        deduped: Number(data.deduped ?? 0),
        skipped: Number(data.skippedNoMetaId ?? 0),
      });
    } catch (err) {
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : "Network error",
      });
    }
  }

  if (state.kind === "success") {
    const total = state.queued + state.deduped;
    if (total === 0) {
      return (
        <span style={{ fontSize: 13, color: "#166534" }}>
          {state.skipped > 0
            ? `Nothing queued — ${state.skipped} winner${state.skipped === 1 ? "" : "s"} need a Meta sync first`
            : "Nothing to queue"}
        </span>
      );
    }
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <Link
          href="/app/meta-queue"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "8px 16px",
            borderRadius: 10,
            fontSize: 14,
            fontWeight: 700,
            background: "#166534",
            color: "#fff",
            textDecoration: "none",
          }}
        >
          {total} queued — review in the action queue ↗
        </Link>
        <span style={{ fontSize: 12, color: "#166534" }}>
          {state.queued > 0 && `${state.queued} new`}
          {state.queued > 0 && state.deduped > 0 && " · "}
          {state.deduped > 0 && `${state.deduped} already pending`}
          {state.skipped > 0 && ` · ${state.skipped} skipped (no Meta id)`}
        </span>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <button
        type="button"
        onClick={handleClick}
        disabled={state.kind === "loading"}
        title="Queues a +15% budget bump on every winning ad. Still has to be approved in the action queue."
        style={{
          padding: "8px 16px",
          borderRadius: 10,
          fontSize: 14,
          fontWeight: 700,
          background: state.kind === "loading" ? "#a7f3d0" : "#166534",
          color: "#fff",
          border: "none",
          cursor: state.kind === "loading" ? "not-allowed" : "pointer",
        }}
      >
        {state.kind === "loading" ? "Queuing…" : "Scale all winners"}
      </button>
      {state.kind === "error" && (
        <span style={{ fontSize: 12, color: "#991b1b" }}>{state.message}</span>
      )}
    </div>
  );
}
