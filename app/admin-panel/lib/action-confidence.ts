// ---------------------------------------------------------------------------
// Helpers for the action card "trust pass": derive a confidence level from
// the global pattern stats and format the supporting evidence into copy a
// human can read at a glance.
//
// Confidence is derived rather than stored — that lets us tune the heuristic
// without a migration, and keeps the action row table lean.
// ---------------------------------------------------------------------------

export type Confidence = "high" | "medium" | "low" | "unknown";

export type PatternStats = {
  pattern_key: string;
  pattern_label: string | null;
  action_summary: string | null;
  times_seen: number;
  unique_clients: number;
  positive_count: number;
  neutral_count: number;
  negative_count: number;
  consistency_score: number; // 0–100
  avg_ctr_lift: number | null;
  avg_cpc_change: number | null;
};

export type LastSimilar = {
  ad_name: string | null;
  outcome: "positive" | "neutral" | "negative" | null;
  ctr_before: number | null;
  ctr_after: number | null;
  completed_at: string | null;
};

// ---------------------------------------------------------------------------
// deriveConfidence: turn pattern stats into a 4-level confidence label.
//   high   — the pattern is well-evidenced AND mostly positive
//   medium — the pattern has moderate evidence
//   low    — the pattern exists but is thin or volatile
//   unknown — no matching pattern at all (cold suggestion)
// ---------------------------------------------------------------------------
export function deriveConfidence(stats: PatternStats | null): Confidence {
  if (!stats) return "unknown";
  if (stats.times_seen >= 3 && stats.consistency_score >= 70) return "high";
  if (stats.times_seen >= 2 && stats.consistency_score >= 40) return "medium";
  return "low";
}

// ---------------------------------------------------------------------------
// confidencePalette: visual treatment for the badge. Calm, control-room.
// ---------------------------------------------------------------------------
export function confidencePalette(level: Confidence): {
  bg: string;
  fg: string;
  border: string;
  label: string;
} {
  switch (level) {
    case "high":
      return {
        bg: "#ecfdf5",
        fg: "#065f46",
        border: "#a7f3d0",
        label: "High confidence",
      };
    case "medium":
      return {
        bg: "#eff6ff",
        fg: "#1e40af",
        border: "#bfdbfe",
        label: "Medium confidence",
      };
    case "low":
      return {
        bg: "#fef3c7",
        fg: "#92400e",
        border: "#fde68a",
        label: "Low confidence",
      };
    case "unknown":
    default:
      return {
        bg: "#f4f4f5",
        fg: "#52525b",
        border: "#e4e4e7",
        label: "Untested",
      };
  }
}

// ---------------------------------------------------------------------------
// formatEvidence: one-line plain-English summary of the supporting evidence.
//   "Worked 12 times across 4 clients · 83% positive · avg CTR +34%"
//   "Tried twice, mixed signals so far"
//   null → no pattern, caller should hide the row
// ---------------------------------------------------------------------------
export function formatEvidence(stats: PatternStats | null): string | null {
  if (!stats) return null;

  const total =
    stats.positive_count + stats.neutral_count + stats.negative_count;
  if (total === 0) return null;

  const tries = `Worked ${stats.times_seen} ${
    stats.times_seen === 1 ? "time" : "times"
  } across ${stats.unique_clients} ${
    stats.unique_clients === 1 ? "client" : "clients"
  }`;

  const positivePct = Math.round((stats.positive_count / total) * 100);
  const positivity = `${positivePct}% positive`;

  const lift =
    stats.avg_ctr_lift != null && Number.isFinite(stats.avg_ctr_lift)
      ? ` · avg CTR ${stats.avg_ctr_lift >= 0 ? "+" : ""}${stats.avg_ctr_lift.toFixed(0)}%`
      : "";

  return `${tries} · ${positivity}${lift}`;
}

// ---------------------------------------------------------------------------
// formatExpectedOutcome: forward-looking copy ("Expected: CTR +34%").
// Returns null when there's no signal worth quoting.
// ---------------------------------------------------------------------------
export function formatExpectedOutcome(
  stats: PatternStats | null
): string | null {
  if (!stats) return null;
  const lift = stats.avg_ctr_lift;
  if (lift == null || !Number.isFinite(lift) || Math.abs(lift) < 1) return null;
  const sign = lift >= 0 ? "+" : "";
  return `Expected: CTR ${sign}${lift.toFixed(0)}% on average`;
}

// ---------------------------------------------------------------------------
// Decision-side counterparts. Decisions don't have a pattern_key — they are
// grouped by `type` (scale_budget, pause_or_replace, etc.). The evidence for
// a pending decision is the history of past decisions of the same type.
// ---------------------------------------------------------------------------

export type DecisionTypeStats = {
  type: string;
  total: number;
  executed: number;
  approved: number;
  rejected: number;
};

export type LastDecision = {
  ad_name: string | null;
  status: string;
  executed_at: string | null;
  execution_result: string | null;
};

// "Done 5 times before · 4 executed without rollback · 1 rejected"
// "First time we're suggesting this move" when there's no history.
export function formatDecisionEvidence(
  stats: DecisionTypeStats | null
): string | null {
  if (!stats || stats.total === 0) {
    return "First time we're suggesting this move — no prior history yet.";
  }
  const parts: string[] = [
    `Done ${stats.total} ${stats.total === 1 ? "time" : "times"} before`,
  ];
  if (stats.executed > 0) {
    parts.push(
      `${stats.executed} executed${
        stats.rejected === 0 ? " without rollback" : ""
      }`
    );
  }
  if (stats.rejected > 0) {
    parts.push(`${stats.rejected} rejected`);
  }
  return parts.join(" · ");
}

// "Last similar: scale_budget on 'Brand X', executed Mar 12 — 'budget +20%'"
export function formatDecisionLastSimilar(
  last: LastDecision | null
): string | null {
  if (!last) return null;
  const adLabel = last.ad_name ? `'${last.ad_name}'` : "another ad";
  const dateStr = last.executed_at
    ? new Date(last.executed_at).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      })
    : null;

  const parts = [`Last similar move on ${adLabel}`];
  if (dateStr) parts.push(dateStr);
  parts.push(last.status);
  let line = parts.join(" · ");
  if (last.execution_result) {
    line += ` — ${last.execution_result}`;
  }
  return line;
}

// Map the raw "low" | "medium" | "high" stored on a decision row to our
// shared Confidence type. Anything unrecognised falls through to "unknown".
export function decisionConfidence(raw: string | null | undefined): Confidence {
  if (raw === "high" || raw === "medium" || raw === "low") return raw;
  return "unknown";
}

// ---------------------------------------------------------------------------
// formatLastSimilar: "Last similar move on 'Late checkout': CTR 0.8% → 1.3%
// (+62%, positive)". Returns null if there's no completed similar action.
// ---------------------------------------------------------------------------
export function formatLastSimilar(last: LastSimilar | null): string | null {
  if (!last) return null;
  const adLabel = last.ad_name ? `'${last.ad_name}'` : "another ad";

  if (
    last.ctr_before != null &&
    last.ctr_after != null &&
    Number.isFinite(last.ctr_before) &&
    Number.isFinite(last.ctr_after) &&
    last.ctr_before > 0
  ) {
    const delta = ((last.ctr_after - last.ctr_before) / last.ctr_before) * 100;
    const sign = delta >= 0 ? "+" : "";
    const tail = last.outcome ? `, ${last.outcome}` : "";
    return `Last similar move on ${adLabel}: CTR ${last.ctr_before.toFixed(
      2
    )}% → ${last.ctr_after.toFixed(2)}% (${sign}${delta.toFixed(0)}%${tail})`;
  }

  if (last.outcome) {
    return `Last similar move on ${adLabel}: ${last.outcome}`;
  }
  return null;
}
