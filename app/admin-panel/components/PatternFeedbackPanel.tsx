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
import SectionCard from "./SectionCard";

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

// Plain-English action phrases. Keys are the bare pattern_key shape minted
// by generate-global-learnings/route.ts (without the industry suffix). New
// pattern_keys added there will fall through to the generator's own
// pattern_label as a backup, which keeps the panel safe even if this map
// drifts.
const ACTION_PHRASES: Record<string, string> = {
  "budget:scale_up": "spending more on winners",
  "budget:scale_down": "cutting spend on losers",
  "budget:pause": "pausing spend on the worst ads",
  "budget:general": "tweaking budgets",
  "creative:pause_replace": "swapping out tired creatives",
  "creative:test_new": "testing fresh creative",
  "creative:switch_to_video": "switching from images to video",
  "creative:switch_to_image": "switching from video to images",
  "creative:general": "changing the creative",
  "hook:test_new": "trying a new opening hook",
  "hook:rewrite": "rewriting the hook",
  "hook:shorten": "shortening the hook",
  "hook:general": "changing the hook",
  "audience:narrow": "narrowing the audience",
  "audience:broaden": "broadening the audience",
  "audience:exclude": "excluding the wrong people",
  "audience:general": "changing the targeting",
  "failure:low_ctr": "killing low-CTR ads early",
  "failure:high_cpc": "killing expensive-click ads early",
  "failure:no_conversions": "killing zero-conversion ads early",
  "failure:general": "killing failing ads early",
};

function capitalise(s: string): string {
  if (!s) return s;
  return s[0].toUpperCase() + s.slice(1);
}

// Strip the industry suffix on per-industry slices so they collapse onto
// the base pattern phrase ("creative:test_new:fitness" → "creative:test_new").
function basePatternKey(key: string): string {
  const parts = key.split(":");
  if (parts.length <= 2) return key;
  return parts.slice(0, 2).join(":");
}

function actionPhrase(
  patternKey: string,
  fallbackLabel: string | null
): string {
  const base = basePatternKey(patternKey);
  if (ACTION_PHRASES[base]) return ACTION_PHRASES[base];
  // Fallback: lowercase the operator-facing label so it slots into the
  // sentence templates without sticking out. Better than showing the raw
  // pattern_key to a non-engineer.
  if (fallbackLabel) return fallbackLabel.toLowerCase();
  return base.replace(":", " ");
}

type SliceRow = {
  pattern_key: string;
  industry: string | null;
  positive: number;
  negative: number;
  decisive: number;
  pos_ratio: number;
  label: string;
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
  const action = actionPhrase(slice.pattern_key, slice.label);
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

  // Two reads in parallel: the verdict ledger and the matching pattern
  // labels. We need labels as a fallback for any pattern_key that isn't
  // in ACTION_PHRASES yet, so the panel never shows a raw key string.
  const [{ data: feedbackRows, error: feedbackErr }, { data: learningRows }] =
    await Promise.all([
      supabase
        .from("pattern_feedback")
        .select(
          "pattern_key, industry, positive_verdicts, negative_verdicts, retired_at, retired_reason"
        ),
      supabase.from("global_learnings").select("pattern_key, pattern_label"),
    ]);

  if (feedbackErr) {
    return (
      <SectionCard title="What the engine is learning">
        <div style={{ fontSize: 13, color: "#a1a1aa" }}>
          Couldn&rsquo;t load the feedback ledger ({feedbackErr.message}).
        </div>
      </SectionCard>
    );
  }

  // Label lookup. First label for a key wins — duplicates across industry
  // slices are fine because the human-readable phrasing is the same.
  const labelByKey = new Map<string, string>();
  for (const r of (learningRows ?? []) as {
    pattern_key: string;
    pattern_label: string | null;
  }[]) {
    if (!labelByKey.has(r.pattern_key) && r.pattern_label) {
      labelByKey.set(r.pattern_key, r.pattern_label);
    }
  }

  let retiredCount = 0;
  const recentRetirements: RecentRetirement[] = [];
  const recentCutoff = Date.now() - RECENT_RETIRE_DAYS * 24 * 60 * 60 * 1000;
  const slices: SliceRow[] = [];
  for (const f of (feedbackRows ?? []) as {
    pattern_key: string;
    industry: string | null;
    positive_verdicts: number | null;
    negative_verdicts: number | null;
    retired_at: string | null;
    retired_reason: string | null;
  }[]) {
    if (f.retired_at) {
      retiredCount++;
      const retiredMs = Date.parse(f.retired_at);
      if (Number.isFinite(retiredMs) && retiredMs >= recentCutoff) {
        recentRetirements.push({
          pattern_key: f.pattern_key,
          industry: f.industry,
          retired_at: f.retired_at,
          retired_reason: f.retired_reason,
          phrase: actionPhrase(
            f.pattern_key,
            labelByKey.get(f.pattern_key) ?? null
          ),
        });
      }
      continue;
    }
    const positive = Number(f.positive_verdicts ?? 0);
    const negative = Number(f.negative_verdicts ?? 0);
    const decisive = positive + negative;
    if (decisive < MIN_DECISIVE) continue;
    slices.push({
      pattern_key: f.pattern_key,
      industry: f.industry,
      positive,
      negative,
      decisive,
      pos_ratio: positive / decisive,
      label: labelByKey.get(f.pattern_key) ?? "",
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
          margin: "8px 0 0",
          padding: 0,
          listStyle: "none",
          display: "flex",
          flexDirection: "column",
          gap: 4,
        }}
      >
        {named.map((r) => (
          <li
            key={`${r.pattern_key}|${r.industry ?? ""}`}
            style={{
              fontSize: 12,
              color: "#7f1d1d",
              lineHeight: 1.45,
            }}
          >
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
            and {overflow} more
          </li>
        )}
      </ul>
      <div
        style={{
          marginTop: 8,
          fontSize: 11,
          color: "#7f1d1d",
        }}
      >
        Hit &ldquo;Give it another chance&rdquo; on the playbook page if you
        think the bad streak had an outside cause.
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
