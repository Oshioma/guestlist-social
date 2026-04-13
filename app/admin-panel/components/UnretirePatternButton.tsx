"use client";

/**
 * "Bring it back" button for retired patterns.
 *
 * Sits on the whats-working playbook page next to the Retired pill. The
 * reaper retires patterns whose engine track record has gone decisively
 * negative — but the engine can't see external causes (Meta outage,
 * holiday traffic, competitor stunt) that might explain a bad streak.
 * This is the operator's veto: clear retired_at, let the engine consult
 * the pattern again, and watch what happens.
 *
 * Verdict counts stay intact. If the pattern's track record is still bad
 * next time the reaper runs, it'll be retired again — that's fine, this
 * is a "give it another chance" button, not a "make it immortal" button.
 *
 * Plain-English copy is intentional. An operator looking at this card
 * shouldn't need to know what "pattern_feedback" or "retired_at" means.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success" }
  | { kind: "error"; message: string };

export default function UnretirePatternButton({
  patternKey,
  industry,
}: {
  patternKey: string;
  // null = agency-wide slice. The route accepts both null and "" — we
  // pass through whatever the parent had so the round-trip stays honest.
  industry: string | null;
}) {
  const router = useRouter();
  const [state, setState] = useState<State>({ kind: "idle" });

  async function handleClick() {
    setState({ kind: "loading" });
    try {
      const res = await fetch("/api/unretire-pattern", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patternKey, industry }),
      });
      const data = await res.json();
      if (!data.ok) {
        setState({ kind: "error", message: data.error ?? "Failed" });
        return;
      }
      setState({ kind: "success" });
      // Re-fetch the server component so the strikethrough and Retired
      // pill drop off the card immediately. Without this the operator
      // sees the success state but the card still looks dead until the
      // next navigation.
      router.refresh();
    } catch (err) {
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : "Network error",
      });
    }
  }

  if (state.kind === "success") {
    return (
      <span
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: "#166534",
          padding: "2px 8px",
          borderRadius: 999,
          background: "#dcfce7",
          border: "1px solid #bbf7d0",
        }}
      >
        Brought back — engine will try it again
      </span>
    );
  }

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <button
        type="button"
        onClick={handleClick}
        disabled={state.kind === "loading"}
        title="Tell the engine to start using this move again. Verdict history stays — if it keeps failing, the reaper will retire it again next week."
        style={{
          padding: "3px 10px",
          borderRadius: 999,
          fontSize: 11,
          fontWeight: 600,
          background: "#fff",
          color: "#18181b",
          border: "1px solid #d4d4d8",
          cursor: state.kind === "loading" ? "wait" : "pointer",
        }}
      >
        {state.kind === "loading" ? "Bringing back…" : "Give it another chance"}
      </button>
      {state.kind === "error" && (
        <span style={{ fontSize: 11, color: "#991b1b" }}>{state.message}</span>
      )}
    </span>
  );
}
