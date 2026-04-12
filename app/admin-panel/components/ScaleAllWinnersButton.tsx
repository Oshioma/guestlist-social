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
      percent: number;
    }
  | { kind: "error"; message: string };

const PERCENT_CHOICES = [5, 10, 15, 20] as const;
const DEFAULT_PERCENT = 15;

export default function ScaleAllWinnersButton({
  clientId,
}: {
  clientId: string;
}) {
  const [state, setState] = useState<State>({ kind: "idle" });
  const [percent, setPercent] = useState<number>(DEFAULT_PERCENT);

  async function handleClick() {
    setState({ kind: "loading" });
    try {
      const res = await fetch("/api/queue-all-winners", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, percentChange: percent }),
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
        percent,
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
          {total} queued at +{state.percent}% — review in the action queue ↗
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

  const loading = state.kind === "loading";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        title={`Queues a +${percent}% budget bump on every winning ad. Still has to be approved in the action queue.`}
        style={{
          padding: "8px 16px",
          borderRadius: 10,
          fontSize: 14,
          fontWeight: 700,
          background: loading ? "#a7f3d0" : "#166534",
          color: "#fff",
          border: "none",
          cursor: loading ? "not-allowed" : "pointer",
        }}
      >
        {loading ? "Queuing…" : `Scale all winners +${percent}%`}
      </button>
      <select
        value={percent}
        onChange={(e) => setPercent(Number(e.target.value))}
        disabled={loading}
        title="How much to bump each winning ad set's daily budget (capped at +20%)"
        style={{
          padding: "6px 8px",
          borderRadius: 8,
          fontSize: 13,
          fontWeight: 600,
          color: "#166534",
          background: "#fff",
          border: "1px solid #bbf7d0",
          cursor: loading ? "not-allowed" : "pointer",
        }}
      >
        {PERCENT_CHOICES.map((p) => (
          <option key={p} value={p}>
            +{p}%
          </option>
        ))}
      </select>
      {state.kind === "error" && (
        <span style={{ fontSize: 12, color: "#991b1b" }}>{state.message}</span>
      )}
    </div>
  );
}
