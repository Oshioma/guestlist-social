/**
 * "What's working right now" — cross-client intelligence hero card.
 *
 * Server component. Reads from global_learnings (populated by
 * /api/generate-global-learnings) and surfaces the top patterns that
 * actually hold across the agency, not just inside one client.
 *
 * The signal we rank by is `consistency_score × unique_clients`. Both
 * matter:
 *
 *   - consistency_score answers "when this happens, does it work most of
 *     the time"
 *   - unique_clients answers "is this true beyond one account"
 *
 * Multiplying them weeds out one-client wonders even if they're 100%
 * consistent, AND weeds out broad-but-noisy patterns even if they show
 * up everywhere.
 *
 * Empty state is intentional and useful: it tells the operator the
 * generator hasn't been run yet, or there's not enough data — both of
 * those are actionable, neither is "we hide the panel".
 */

import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

type GlobalLearning = {
  id: number;
  pattern_type: string;
  pattern_label: string;
  action_summary: string;
  unique_clients: number;
  times_seen: number;
  consistency_score: number;
  avg_ctr_lift: number | null;
  last_updated: string | null;
};

// Mirror of GENERATOR_WINDOW_DAYS in app/api/generate-global-learnings.
// Kept as a literal here so the hero card can render an honest "data window"
// label without having to fetch from the route. If you change it in the
// generator, change it here too — the constants are tied by intent, not by
// import (the route is server-only, this component is also server-only but
// importing the route module would pull route handler code into the page).
const GENERATOR_WINDOW_DAYS = 90;

// How stale the playbook is allowed to get before the hero card prompts the
// operator to re-run the generator. Below this, we still show the patterns;
// above this, the panel turns into a "playbook is stale, refresh me" nudge.
const STALE_AFTER_DAYS = 14;

const PATTERN_ICON: Record<string, string> = {
  creative_format: "▣",
  creative_hook: "✦",
  hook: "✦",
  creative: "▣",
  audience: "◈",
  budget: "◇",
  failure: "✕",
  fast_win: "▲",
  other: "·",
};

export default async function WhatsWorkingNow() {
  const supabase = await createClient();

  // Pull a wider net than we'll show — we filter and rank in code so the
  // ranking logic stays explicit and inspectable.
  const { data, error } = await supabase
    .from("global_learnings")
    .select(
      "id, pattern_type, pattern_label, action_summary, unique_clients, times_seen, consistency_score, avg_ctr_lift, last_updated"
    )
    .gte("unique_clients", 2)
    .order("consistency_score", { ascending: false })
    .limit(40);

  if (error || !data || data.length === 0) {
    return (
      <section
        style={{
          borderRadius: 16,
          padding: 20,
          background: "linear-gradient(135deg, #0c1117 0%, #1a2230 100%)",
          color: "#fff",
          border: "1px solid #1f2937",
        }}
      >
        <Header />
        <div
          style={{
            marginTop: 14,
            fontSize: 13,
            color: "#94a3b8",
            lineHeight: 1.6,
          }}
        >
          {error
            ? `Couldn't load global learnings (${error.message}).`
            : "No cross-client patterns yet. Run the global learnings generator (Memory page) once you have completed actions across at least 2 clients."}
        </div>
      </section>
    );
  }

  // Rank: consistency × unique_clients. We deliberately don't include
  // ad_count / times_seen here — a high-volume noisy pattern shouldn't
  // beat a tight, broad one.
  const rows = data as GlobalLearning[];
  const ranked = rows
    .map((r) => ({
      ...r,
      _score: Number(r.consistency_score ?? 0) * Number(r.unique_clients ?? 0),
    }))
    .sort((a, b) => b._score - a._score)
    .slice(0, 5);

  // Most recent generator run timestamp across all rows. Every row gets the
  // same `last_updated` from a single generator pass, so this is effectively
  // "when was the playbook last refreshed".
  const lastRunIso = rows
    .map((r) => r.last_updated)
    .filter((v): v is string => Boolean(v))
    .sort()
    .reverse()[0];

  const lastRunDate = lastRunIso ? new Date(lastRunIso) : null;
  const ageDays = lastRunDate
    ? Math.floor((Date.now() - lastRunDate.getTime()) / (24 * 60 * 60 * 1000))
    : null;
  const isStale = ageDays !== null && ageDays >= STALE_AFTER_DAYS;

  return (
    <section
      style={{
        borderRadius: 16,
        padding: 20,
        background: "linear-gradient(135deg, #0c1117 0%, #1a2230 100%)",
        color: "#fff",
        border: "1px solid #1f2937",
      }}
    >
      <Header />

      <div
        style={{
          marginTop: 14,
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        {ranked.map((r) => {
          const icon = PATTERN_ICON[r.pattern_type] ?? "·";
          const lift = r.avg_ctr_lift;
          const liftLabel =
            lift != null
              ? lift > 0
                ? `+${lift.toFixed(0)}% CTR`
                : `${lift.toFixed(0)}% CTR`
              : null;
          const liftPositive = (lift ?? 0) >= 0;

          return (
            <div
              key={r.id}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 12,
                padding: "10px 12px",
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.06)",
                borderRadius: 10,
              }}
            >
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 8,
                  background: "rgba(96,165,250,0.16)",
                  color: "#93c5fd",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 14,
                  flexShrink: 0,
                }}
              >
                {icon}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    lineHeight: 1.35,
                    color: "#f1f5f9",
                  }}
                >
                  {r.action_summary}
                </div>
                <div
                  style={{
                    marginTop: 4,
                    fontSize: 11,
                    color: "#94a3b8",
                    display: "flex",
                    gap: 10,
                    flexWrap: "wrap",
                  }}
                >
                  <span>{r.unique_clients} clients</span>
                  <span style={{ color: "#475569" }}>·</span>
                  <span>{r.times_seen} signals</span>
                  <span style={{ color: "#475569" }}>·</span>
                  <span>{Number(r.consistency_score).toFixed(0)}% consistent</span>
                  {liftLabel && (
                    <>
                      <span style={{ color: "#475569" }}>·</span>
                      <span
                        style={{
                          color: liftPositive ? "#4ade80" : "#f87171",
                          fontWeight: 600,
                        }}
                      >
                        {liftLabel}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 14, fontSize: 11, color: "#64748b" }}>
        Last {GENERATOR_WINDOW_DAYS} days of data · ranked by consistency ×
        client breadth · only patterns seen across at least 2 clients are
        eligible ·{" "}
        <Link
          href="/app/whats-working"
          style={{ color: "#93c5fd", textDecoration: "none" }}
        >
          See full playbook →
        </Link>
      </div>

      {ageDays !== null && (
        <div
          style={{
            marginTop: 8,
            fontSize: 11,
            color: isStale ? "#fbbf24" : "#475569",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          {isStale && <span>⚠</span>}
          <span>
            Playbook refreshed{" "}
            {ageDays === 0
              ? "today"
              : ageDays === 1
              ? "yesterday"
              : `${ageDays} days ago`}
            {isStale && " — re-run from the Memory page to pick up new signals"}
          </span>
        </div>
      )}
    </section>
  );
}

function Header() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        flexWrap: "wrap",
      }}
    >
      <div
        style={{
          padding: "4px 10px",
          borderRadius: 999,
          background: "rgba(96,165,250,0.12)",
          color: "#93c5fd",
          fontSize: 11,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
        }}
      >
        Agency edge
      </div>
      <h2
        style={{
          margin: 0,
          fontSize: 18,
          fontWeight: 700,
          letterSpacing: "-0.01em",
        }}
      >
        What&rsquo;s working right now
      </h2>
      <span
        style={{
          fontSize: 12,
          color: "#64748b",
        }}
      >
        across all clients
      </span>
    </div>
  );
}
