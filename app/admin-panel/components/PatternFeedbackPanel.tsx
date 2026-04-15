/**
 * Pattern feedback panel — plain-English read on which engine moves are
 * paying off and which aren't.
 *
 * Server component. Reads `pattern_feedback` (the engine's own track-record
 * ledger), splits the slices into "working" vs "not working" by the ratio
 * of positive-to-decisive verdicts, and renders the top three of each side
 * as one-sentence statements an operator can grok at a glance.
 *
 * The point is to surface the loop without making the operator hunt for
 * it. The whats-working playbook page has all the same data with more
 * detail; this panel is the dashboard-level "is the engine getting it
 * right?" frame, sitting alongside DecisionAccuracy.
 *
 * Translation choices:
 *   • We don't reuse global_learnings.pattern_label here. Those labels are
 *     fine on the playbook page ("Pause and replace creative") but on the
 *     dashboard we want chattier phrasing ("swapping out tired creatives").
 *     The ACTION_PHRASES table is the canonical translation layer for the
 *     real pattern_key universe minted by generate-global-learnings.
 *   • Anything below MIN_DECISIVE verdicts is dropped — three is the same
 *     threshold the engine uses for its in-memory veto, so it's the
 *     smallest sample we'd act on.
 *   • Retired slices are excluded from both lists (they're already dead;
 *     showing them in "not working" would double-count). The subtitle
 *     surfaces the retired count so the operator can see the reaper
 *     working.
 */

import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { capitalise } from "@/lib/pattern-phrases";
import { fetchAnnotatedPatternFeedback } from "@/lib/pattern-feedback";
import SectionCard from "./SectionCard";
import UnretirePatternButton from "./UnretirePatternButton";

// Same threshold the engine uses for its in-memory pattern veto. Below
// this, the sample is too small to draw any conclusion either way and
// we'd rather show nothing than something misleading.
const MIN_DECISIVE = 3;
const MAX_PER_COLUMN = 3;
// How far back we count "the reaper just killed something" for the
// notification banner. Seven days lines up with the cron's weekly
// schedule — anything older is "old news, you've already seen it".
const RECENT_RETIRE_DAYS = 7;
const MAX_RECENT_NAMED = 3;

type SliceRow = {
  pattern_key: string;
  industry: string | null;
  positive: number;
  negative: number;
  decisive: number;
  pos_ratio: number;
  phrase: string;
};

type RecentRetirement = {
  pattern_key: string;
  industry: string | null;
  retired_at: string;
  retired_reason: string | null;
  phrase: string;
};

// "Tue", "Mon", "today" — short relative-date label for the banner. Don't
// bother with humanAgo here because the banner only shows entries from
// the last 7 days, so calendar-day phrasing is more readable than
// "5 hours ago".
function shortRelativeDay(iso: string): string {
  const then = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - then.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) return "today";
  if (diffDays === 1) return "yesterday";
  return then.toLocaleDateString("en-GB", { weekday: "short" });
}

function plainSentence(slice: SliceRow): string {
  const action = slice.phrase;
  const { positive, decisive } = slice;
  const negative = decisive - positive;

  if (positive === decisive) {
    return `${capitalise(action)} has worked every time we've tried it (${positive} out of ${decisive}).`;
  }
  if (positive === 0) {
    return `${capitalise(action)} hasn't worked once — failed all ${decisive} times we tried.`;
  }
  if (positive > negative) {
    return `${capitalise(action)} is paying off — worked ${positive} out of ${decisive} times.`;
  }
  // Net negative but not zero
  return `${capitalise(action)} isn't landing — only worked ${positive} out of ${decisive} times.`;
}

export default async function PatternFeedbackPanel() {
  const supabase = await createClient();

  const { rows: annotated, error: feedbackErr } =
    await fetchAnnotatedPatternFeedback(supabase);

  if (feedbackErr) {
    return (
      <SectionCard title="What the engine is learning">
        <div style={{ fontSize: 13, color: "#a1a1aa" }}>
          Couldn&rsquo;t load the feedback ledger ({feedbackErr}).
        </div>
      </SectionCard>
    );
  }

  let retiredCount = 0;
  const recentRetirements: RecentRetirement[] = [];
  const recentCutoff = Date.now() - RECENT_RETIRE_DAYS * 24 * 60 * 60 * 1000;
  const slices: SliceRow[] = [];
  for (const r of annotated) {
    if (r.retired_at) {
      retiredCount++;
      const retiredMs = Date.parse(r.retired_at);
      if (Number.isFinite(retiredMs) && retiredMs >= recentCutoff) {
        recentRetirements.push({
          pattern_key: r.pattern_key,
          industry: r.industry,
          retired_at: r.retired_at,
          retired_reason: r.retired_reason,
          phrase: r.phrase,
        });
      }
      continue;
    }
    if (r.decisive < MIN_DECISIVE) continue;
    slices.push({
      pattern_key: r.pattern_key,
      industry: r.industry,
      positive: r.positive,
      negative: r.negative,
      decisive: r.decisive,
      pos_ratio: r.positive / r.decisive,
      phrase: r.phrase,
    });
  }

  // Working: ratio > 0.5 (more wins than losses), sorted by ratio then by
  // sample size so a 4/4 ranks above a 3/4 even though both are 100% / 75%.
  const working = slices
    .filter((s) => s.pos_ratio > 0.5)
    .sort((a, b) => {
      if (b.pos_ratio !== a.pos_ratio) return b.pos_ratio - a.pos_ratio;
      return b.decisive - a.decisive;
    })
    .slice(0, MAX_PER_COLUMN);

  // Not working: ratio < 0.5. Equal-split slices live in neither column —
  // they're the inconclusive middle and would just add noise.
  const notWorking = slices
    .filter((s) => s.pos_ratio < 0.5)
    .sort((a, b) => {
      if (a.pos_ratio !== b.pos_ratio) return a.pos_ratio - b.pos_ratio;
      return b.decisive - a.decisive;
    })
    .slice(0, MAX_PER_COLUMN);

  const empty = working.length === 0 && notWorking.length === 0;

  // Newest first so the banner reads "this week's news" — the operator sees
  // what just got killed before they see what got killed last week.
  recentRetirements.sort(
    (a, b) => Date.parse(b.retired_at) - Date.parse(a.retired_at)
  );

  return (
    <SectionCard title="What the engine is learning">
      <div style={{ fontSize: 12, color: "#71717a", marginTop: -8, marginBottom: 14 }}>
        Plain-English read on which moves are paying off and which aren&rsquo;t.
        {retiredCount > 0 &&
          ` ${retiredCount} pattern${retiredCount === 1 ? "" : "s"} retired by the reaper.`}
      </div>

      {recentRetirements.length > 0 && (
        <RecentRetirementsBanner retirements={recentRetirements} />
      )}

      {empty ? (
        <div style={{ fontSize: 13, color: "#a1a1aa", padding: "8px 0" }}>
          Not enough verdicts yet — the engine needs at least {MIN_DECISIVE}{" "}
          measured outcomes per move before there&rsquo;s anything to say.
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: 16,
          }}
        >
          <FeedbackColumn
            title="Working"
            tone="positive"
            slices={working}
            emptyText="No clear winners yet."
          />
          <FeedbackColumn
            title="Not working"
            tone="negative"
            slices={notWorking}
            emptyText="Nothing struggling right now."
          />
        </div>
      )}
    </SectionCard>
  );
}

function RecentRetirementsBanner({
  retirements,
}: {
  retirements: RecentRetirement[];
}) {
  const named = retirements.slice(0, MAX_RECENT_NAMED);
  const overflow = retirements.length - named.length;
  const total = retirements.length;

  return (
    <div
      style={{
        marginBottom: 16,
        padding: "12px 14px",
        background: "#fef2f2",
        border: "1px solid #fecaca",
        borderRadius: 10,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 700, color: "#991b1b" }}>
          {total === 1
            ? "1 move was retired this week"
            : `${total} moves were retired this week`}
        </div>
        <Link
          href="/whats-working"
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: "#991b1b",
            textDecoration: "none",
            padding: "3px 10px",
            borderRadius: 999,
            background: "#fff",
            border: "1px solid #fecaca",
          }}
        >
          Review them →
        </Link>
      </div>
      <ul
        style={{
          margin: "10px 0 0",
          padding: 0,
          listStyle: "none",
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        {named.map((r) => (
          <li
            key={`${r.pattern_key}|${r.industry ?? ""}`}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
              fontSize: 12,
              color: "#7f1d1d",
              lineHeight: 1.45,
              padding: "6px 10px",
              background: "#fff",
              border: "1px solid #fecaca",
              borderRadius: 8,
            }}
          >
            <div style={{ flex: "1 1 240px", minWidth: 0 }}>
              <span style={{ fontWeight: 600 }}>
                {r.phrase[0].toUpperCase() + r.phrase.slice(1)}
              </span>
              {r.industry && (
                <span style={{ color: "#a1a1aa" }}> · {r.industry}</span>
              )}
              {r.retired_reason && (
                <span style={{ color: "#a1a1aa" }}> · {r.retired_reason}</span>
              )}
              <span style={{ color: "#a1a1aa" }}>
                {" "}
                · {shortRelativeDay(r.retired_at)}
              </span>
            </div>
            <UnretirePatternButton
              patternKey={r.pattern_key}
              industry={r.industry}
            />
          </li>
        ))}
        {overflow > 0 && (
          <li
            style={{
              fontSize: 11,
              color: "#a1a1aa",
              fontStyle: "italic",
              marginTop: 2,
            }}
          >
            and {overflow} more — see the{" "}
            <Link href="/whats-working" style={{ color: "#991b1b" }}>
              playbook
            </Link>
          </li>
        )}
      </ul>
      <div
        style={{
          marginTop: 10,
          fontSize: 11,
          color: "#7f1d1d",
        }}
      >
        Click &ldquo;Give it another chance&rdquo; if you think the bad streak
        had an outside cause — Meta outage, holiday week, competitor stunt.
        Verdict history stays intact, so if it keeps failing the reaper will
        retire it again next week.
      </div>
    </div>
  );
}

function FeedbackColumn({
  title,
  tone,
  slices,
  emptyText,
}: {
  title: string;
  tone: "positive" | "negative";
  slices: SliceRow[];
  emptyText: string;
}) {
  const accent = tone === "positive" ? "#166534" : "#991b1b";
  const bg = tone === "positive" ? "#f0fdf4" : "#fef2f2";
  const border = tone === "positive" ? "#bbf7d0" : "#fecaca";

  return (
    <div>
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: accent,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          marginBottom: 8,
        }}
      >
        {title}
      </div>
      {slices.length === 0 ? (
        <div style={{ fontSize: 12, color: "#a1a1aa", padding: "6px 0" }}>
          {emptyText}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {slices.map((s) => (
            <div
              key={`${s.pattern_key}|${s.industry ?? ""}`}
              style={{
                fontSize: 13,
                lineHeight: 1.45,
                color: "#18181b",
                padding: "10px 12px",
                background: bg,
                border: `1px solid ${border}`,
                borderRadius: 8,
              }}
            >
              {plainSentence(s)}
              {s.industry && (
                <div
                  style={{
                    fontSize: 10,
                    color: "#71717a",
                    marginTop: 4,
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                  }}
                >
                  {s.industry} clients
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
