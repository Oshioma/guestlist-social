// ---------------------------------------------------------------------------
// "What's the engine doing right now"
//
// A one-row activity strip on the dashboard that answers the most basic
// operator question: is the engine actually doing anything? It pulls three
// signals from the last hour (with a 24-hour fallback when the hour is
// quiet) and renders them as plain-English sentences:
//
//   1. How many decisions executed against Meta — the action.
//   2. How many decisions are sitting in the queue waiting for sign-off
//      — the inbox.
//   3. How many verdicts came back from the measurement loop — the score.
//
// The strip is deliberately small and stateless. It re-renders on every
// dashboard load (force-dynamic) so "right now" is honest. If the operator
// reloads the page and the counts change, that's the engine working.
// ---------------------------------------------------------------------------

import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";

// Map of decision_type → plural label for chatty grouping. Keep in sync
// with MetaQueueRow's DECISION_LABELS — the live set is small enough that
// duplication is cheaper than an indirection.
const DECISION_PLURALS: Record<string, { one: string; many: string }> = {
  pause_ad: { one: "pause", many: "pauses" },
  increase_adset_budget: { one: "budget bump", many: "budget bumps" },
  decrease_adset_budget: { one: "budget pullback", many: "budget pullbacks" },
  duplicate_ad: { one: "duplicate", many: "duplicates" },
};

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

type ExecutedRow = { decision_type: string };
type VerdictRow = { verdict: string | null };

// Group raw decision_type strings into "3 pauses, 1 budget bump"-shaped
// phrases. Unknown decision_types fall back to a generic "change" so a
// new type added in the future doesn't disappear from the strip while we
// wait for the label map to catch up.
function summarizeDecisions(rows: ExecutedRow[]): string {
  if (rows.length === 0) return "";
  const counts = new Map<string, number>();
  for (const r of rows) {
    counts.set(r.decision_type, (counts.get(r.decision_type) ?? 0) + 1);
  }
  const parts: string[] = [];
  for (const [type, count] of counts) {
    const label =
      DECISION_PLURALS[type] ?? { one: "change", many: "changes" };
    parts.push(`${count} ${count === 1 ? label.one : label.many}`);
  }
  // Stable order: biggest group first so the most newsworthy thing leads.
  parts.sort((a, b) => Number(b.split(" ")[0]) - Number(a.split(" ")[0]));
  return parts.join(", ");
}

function summarizeVerdicts(rows: VerdictRow[]): string | null {
  if (rows.length === 0) return null;
  let wins = 0;
  let duds = 0;
  let neutral = 0;
  for (const r of rows) {
    if (r.verdict === "positive") wins += 1;
    else if (r.verdict === "negative") duds += 1;
    else if (r.verdict === "neutral") neutral += 1;
  }
  const parts: string[] = [];
  if (wins > 0) parts.push(`${wins} ${wins === 1 ? "win" : "wins"}`);
  if (duds > 0) parts.push(`${duds} ${duds === 1 ? "dud" : "duds"}`);
  if (neutral > 0) parts.push(`${neutral} too close to call`);
  if (parts.length === 0) return null;
  return parts.join(", ");
}

export default async function EngineActivityStrip() {
  let supabase;
  try {
    supabase = createAdminClient();
  } catch {
    // Env vars missing — strip is non-critical, just don't render it.
    return null;
  }

  const now = Date.now();
  const hourAgo = new Date(now - HOUR_MS).toISOString();
  const dayAgo = new Date(now - DAY_MS).toISOString();

  // Three independent reads — fire in parallel. Pending count uses head:true
  // because we only care about the number, not the rows themselves.
  const [executedHourRes, executedDayRes, pendingRes, verdictsHourRes, verdictsDayRes] =
    await Promise.all([
      supabase
        .from("meta_execution_queue")
        .select("decision_type")
        .eq("status", "executed")
        .gte("executed_at", hourAgo)
        .order("executed_at", { ascending: false })
        .limit(50),
      supabase
        .from("meta_execution_queue")
        .select("decision_type")
        .eq("status", "executed")
        .gte("executed_at", dayAgo)
        .order("executed_at", { ascending: false })
        .limit(50),
      supabase
        .from("meta_execution_queue")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending"),
      supabase
        .from("decision_outcomes")
        .select("verdict")
        .eq("status", "measured")
        .gte("measured_at", hourAgo)
        .limit(50),
      supabase
        .from("decision_outcomes")
        .select("verdict")
        .eq("status", "measured")
        .gte("measured_at", dayAgo)
        .limit(50),
    ]);

  const executedHour = (executedHourRes.data ?? []) as ExecutedRow[];
  const executedDay = (executedDayRes.data ?? []) as ExecutedRow[];
  const verdictsHour = (verdictsHourRes.data ?? []) as VerdictRow[];
  const verdictsDay = (verdictsDayRes.data ?? []) as VerdictRow[];
  const pendingCount = pendingRes.count ?? 0;

  // "Right now" preference: if the last hour has any signal, lead with it.
  // Otherwise fall back to the 24-hour view so a quiet hour doesn't make
  // the strip look like the engine is dead.
  const hadHourActivity = executedHour.length > 0 || verdictsHour.length > 0;
  const window = hadHourActivity ? "in the last hour" : "in the last 24 hours";
  const executedRows = hadHourActivity ? executedHour : executedDay;
  const verdictRows = hadHourActivity ? verdictsHour : verdictsDay;

  const decisionsPhrase = summarizeDecisions(executedRows);
  const verdictsPhrase = summarizeVerdicts(verdictRows);

  // Build the headline. Three states:
  //   1. Action happened: "Pushed N changes — 3 pauses, 1 bump"
  //   2. No action but verdicts came in: "Measured N decisions"
  //   3. Nothing at all: "Quiet right now"
  let headline: string;
  if (decisionsPhrase) {
    headline = `Pushed ${executedRows.length} ${
      executedRows.length === 1 ? "change" : "changes"
    } to Meta ${window} — ${decisionsPhrase}.`;
  } else if (verdictsPhrase) {
    headline = `No new changes ${window}, but the measurement loop has been running.`;
  } else {
    headline = `Quiet ${window}. The engine is watching but hasn't needed to act.`;
  }

  const subParts: string[] = [];
  if (pendingCount > 0) {
    subParts.push(
      `${pendingCount} ${
        pendingCount === 1 ? "change is" : "changes are"
      } waiting for your sign-off`
    );
  }
  if (verdictsPhrase) {
    subParts.push(`measurement loop scored ${verdictsPhrase}`);
  }
  const subline =
    subParts.length > 0
      ? subParts.join(" · ").replace(/^./, (c) => c.toUpperCase()) + "."
      : null;

  // Live-dot color: green if anything is moving, amber if only the inbox
  // is non-empty, gray if everything is still.
  const isMoving = executedRows.length > 0 || verdictRows.length > 0;
  const dotColor = isMoving ? "#22c55e" : pendingCount > 0 ? "#f59e0b" : "#a1a1aa";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 14,
        padding: "14px 18px",
        borderRadius: 14,
        border: "1px solid #e4e4e7",
        background: "#fff",
      }}
    >
      <span
        style={{
          width: 10,
          height: 10,
          borderRadius: "50%",
          background: dotColor,
          marginTop: 6,
          flexShrink: 0,
          boxShadow: isMoving ? `0 0 0 4px ${dotColor}26` : undefined,
        }}
        aria-hidden
      />
      <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1 }}>
        <div style={{ fontSize: 11, color: "#a1a1aa", letterSpacing: 0.4 }}>
          WHAT THE ENGINE IS DOING RIGHT NOW
        </div>
        <div style={{ fontSize: 14, color: "#18181b", fontWeight: 600 }}>
          {headline}
        </div>
        {subline && (
          <div style={{ fontSize: 13, color: "#52525b" }}>{subline}</div>
        )}
      </div>
      {pendingCount > 0 && (
        <Link
          href="/admin-panel/meta-queue"
          style={{
            alignSelf: "center",
            padding: "6px 12px",
            borderRadius: 999,
            border: "1px solid #fde68a",
            background: "#fffbeb",
            color: "#92400e",
            fontSize: 12,
            fontWeight: 600,
            textDecoration: "none",
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          Review queue →
        </Link>
      )}
    </div>
  );
}
