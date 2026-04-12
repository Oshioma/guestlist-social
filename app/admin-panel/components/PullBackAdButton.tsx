"use client";

// Mirror of ScaleAdButton for budget pullbacks. Lives on losing/problem
// rows where the operator wants a softer alternative to pausing — throttle
// the spend, see if quality recovers, decide later.

import { useState } from "react";
import Link from "next/link";

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success"; queueId: number; deduped: boolean; percent: number }
  | { kind: "error"; message: string };

// Pullback caps are looser than bumps (executor allows up to −50%) since
// cutting spend is the conservative side of the trade. Default −25% aligns
// with the seeder's DEFAULT_BUDGET_PULLBACK_PCT.
const PERCENT_CHOICES = [10, 25, 40, 50] as const;
const DEFAULT_PERCENT = 25;

export default function PullBackAdButton({
  adId,
  hasAdsetMetaId,
}: {
  adId: number;
  hasAdsetMetaId: boolean;
}) {
  const [state, setState] = useState<State>({ kind: "idle" });
  const [percent, setPercent] = useState<number>(DEFAULT_PERCENT);

  async function handleClick() {
    setState({ kind: "loading" });
    try {
      const res = await fetch("/api/queue-budget-pullback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adId, percentChange: percent }),
      });
      const data = await res.json();
      if (!data.ok) {
        setState({ kind: "error", message: data.error ?? "Failed" });
      } else {
        setState({
          kind: "success",
          queueId: Number(data.queueId),
          deduped: Boolean(data.deduped),
          percent,
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
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
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
            background: "#854d0e",
            color: "#fff",
            textDecoration: "none",
            textTransform: "uppercase",
            letterSpacing: "0.04em",
          }}
        >
          {state.deduped ? `Already queued −${state.percent}% ↗` : `Queued −${state.percent}% ↗`}
        </Link>
        <span
          style={{ fontSize: 11, color: "#71717a", fontFamily: "monospace" }}
          title="Action queue row id"
        >
          #{state.queueId}
        </span>
      </span>
    );
  }

  const disabled = state.kind === "loading" || !hasAdsetMetaId;
  const title = !hasAdsetMetaId
    ? "Missing ad set Meta id — run a Meta sync first"
    : `Queue a −${percent}% budget pullback on this ad set. Needs approval before it hits Meta.`;

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
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
          background: disabled ? "#fde68a" : "#854d0e",
          color: "#fff",
          border: "none",
          cursor: disabled ? "not-allowed" : "pointer",
          textTransform: "uppercase",
          letterSpacing: "0.04em",
        }}
      >
        {state.kind === "loading" ? "Queuing…" : `Pull back −${percent}%`}
      </button>
      <select
        value={percent}
        onChange={(e) => setPercent(Number(e.target.value))}
        disabled={disabled}
        title="How much to cut the daily budget (capped at −50%)"
        style={{
          padding: "3px 4px",
          borderRadius: 6,
          fontSize: 11,
          fontWeight: 600,
          color: "#854d0e",
          background: "#fff",
          border: "1px solid #fde68a",
          cursor: disabled ? "not-allowed" : "pointer",
        }}
      >
        {PERCENT_CHOICES.map((p) => (
          <option key={p} value={p}>
            −{p}%
          </option>
        ))}
      </select>
      {state.kind === "error" && (
        <span style={{ fontSize: 11, color: "#991b1b" }}>{state.message}</span>
      )}
    </span>
  );
}
