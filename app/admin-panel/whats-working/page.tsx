import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import SectionCard from "@/app/admin-panel/components/SectionCard";
import RefreshEverythingButton from "@/app/admin-panel/components/RefreshEverythingButton";
import GenerateGlobalLearningsButton from "@/app/admin-panel/components/GenerateGlobalLearningsButton";

export const dynamic = "force-dynamic";

type GlobalLearning = {
  id: number;
  pattern_type: string;
  pattern_key: string;
  pattern_label: string;
  action_summary: string;
  times_seen: number;
  unique_clients: number;
  positive_count: number;
  neutral_count: number;
  negative_count: number;
  avg_ctr_lift: number | null;
  avg_cpc_change: number | null;
  avg_reliability: number | null;
  consistency_score: number;
  sample_learnings: {
    learning: string;
    outcome: string;
    ctr_lift: number | null;
    client_id: number | null;
  }[] | null;
  top_tags: string[] | null;
  industry: string | null;
  last_updated: string | null;
};

function consistencyColor(score: number): string {
  if (score >= 75) return "#166534";
  if (score >= 50) return "#92400e";
  return "#991b1b";
}

// Build one plain-English sentence that captures what this pattern tells us.
// No percentage chips, no jargon — just: "Works N/10 times, tried by X clients,
// clicks went up by Y%."
function storyLine(pattern: GlobalLearning): string {
  const worked = Math.round(pattern.consistency_score / 10);
  const parts: string[] = [];
  parts.push(`Worked ${worked} out of 10 times`);
  if (pattern.unique_clients > 0) {
    parts.push(
      `across ${pattern.unique_clients} client${
        pattern.unique_clients === 1 ? "" : "s"
      }`
    );
  }
  if (pattern.avg_ctr_lift && pattern.avg_ctr_lift !== 0) {
    const dir = pattern.avg_ctr_lift > 0 ? "up" : "down";
    parts.push(
      `clicks went ${dir} by ${Math.abs(pattern.avg_ctr_lift).toFixed(0)}%`
    );
  }
  if (pattern.avg_cpc_change && pattern.avg_cpc_change !== 0) {
    const dir = pattern.avg_cpc_change < 0 ? "cheaper" : "more expensive";
    parts.push(
      `clicks got ${Math.abs(pattern.avg_cpc_change).toFixed(0)}% ${dir}`
    );
  }
  return parts.join(", ") + ".";
}

// Engine track record from pattern_feedback. Distinct from operator-recorded
// outcomes — these only exist when the decision engine itself seeded a
// pattern-backed action that later got a verdict from measureDueOutcomes.
// Lookup is keyed on (pattern_key, industry); empty string industry means
// the agency-wide bucket, matching global_learnings rows where industry is
// null. Falls back silently to "no badge" when the row is absent.
type EngineFeedback = {
  engine_uses: number;
  positive_verdicts: number;
  negative_verdicts: number;
  neutral_verdicts: number;
  inconclusive_verdicts: number;
};

// One row in the "Recent engine verdicts" panel. This is a single
// measured decision_outcomes row stitched to its source pattern (via
// meta_execution_queue.source_pattern_key) and the client name. We
// keep it at module scope so the panel component below can take a
// concrete type instead of `any`.
type EngineVerdictRow = {
  id: number;
  pattern_key: string;
  pattern_industry: string | null;
  decision_type: string;
  verdict: string;
  verdict_reason: string | null;
  ctr_lift_pct: number | null;
  cpm_change_pct: number | null;
  measured_at: string | null;
  client_name: string | null;
};

function engineTrackRecordLine(fb: EngineFeedback): string | null {
  if (fb.engine_uses <= 0) return null;
  const positive = fb.positive_verdicts;
  const negative = fb.negative_verdicts;
  const settled = positive + negative;
  // Inconclusive / neutral land in this bucket — we count them as "still
  // measuring" so the operator sees something rather than a misleading 0/0.
  if (settled === 0) {
    return `Auto-tested ${fb.engine_uses}× · still measuring`;
  }
  if (negative === 0) {
    return `Auto-tested ${fb.engine_uses}× · all ${positive} worked`;
  }
  if (positive === 0) {
    return `Auto-tested ${fb.engine_uses}× · none worked`;
  }
  return `Auto-tested ${fb.engine_uses}× · ${positive} worked · ${negative} didn't`;
}

function engineTrackRecordColor(fb: EngineFeedback): string {
  const positive = fb.positive_verdicts;
  const negative = fb.negative_verdicts;
  const settled = positive + negative;
  if (settled === 0) return "#71717a"; // grey: inconclusive
  const ratio = positive / settled;
  if (ratio >= 0.66) return "#166534"; // green
  if (ratio >= 0.33) return "#92400e"; // amber
  return "#991b1b"; // red
}

function PatternCard({
  pattern,
  feedback,
}: {
  pattern: GlobalLearning;
  feedback: EngineFeedback | null;
}) {
  const total = pattern.positive_count + pattern.neutral_count + pattern.negative_count;
  const trackLine = feedback ? engineTrackRecordLine(feedback) : null;

  return (
    <div
      style={{
        border: "1px solid #e4e4e7",
        borderRadius: 10,
        padding: 14,
        background: "#fff",
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 600, color: "#18181b" }}>
        {pattern.pattern_label}
      </div>
      <div style={{ fontSize: 13, color: "#52525b", marginTop: 4 }}>
        {pattern.action_summary}
      </div>

      {total > 0 && (
        <div
          style={{
            marginTop: 10,
            padding: "8px 12px",
            background: "#fafafa",
            border: "1px solid #f4f4f5",
            borderRadius: 8,
            fontSize: 12,
            color: consistencyColor(pattern.consistency_score),
            fontWeight: 600,
          }}
        >
          {storyLine(pattern)}
        </div>
      )}

      {pattern.sample_learnings && pattern.sample_learnings.length > 0 && (
        <div style={{ marginTop: 8 }}>
          {pattern.sample_learnings.slice(0, 1).map((s, i) => (
            <div
              key={i}
              style={{
                fontSize: 12,
                color: "#52525b",
                fontStyle: "italic",
                marginTop: 4,
                paddingLeft: 10,
                borderLeft: "2px solid #e4e4e7",
              }}
            >
              &ldquo;{s.learning}&rdquo;
            </div>
          ))}
        </div>
      )}

      {total === 0 && !trackLine && (
        <div style={{ fontSize: 11, color: "#a1a1aa", marginTop: 6 }}>
          Not enough data to say for sure yet.
        </div>
      )}

      {trackLine && feedback && (
        <div
          style={{
            marginTop: 8,
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "4px 10px",
            borderRadius: 999,
            fontSize: 11,
            fontWeight: 600,
            color: engineTrackRecordColor(feedback),
            background: "#fafafa",
            border: "1px solid #e4e4e7",
          }}
          title="Verdicts from when the decision engine actually ran this pattern. Updates every time measureDueOutcomes lands a result."
        >
          <span aria-hidden style={{ fontSize: 10 }}>●</span>
          {trackLine}
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  subtitle,
  patterns,
  emptyText,
  feedbackByKey,
}: {
  title: string;
  subtitle: string;
  patterns: GlobalLearning[];
  emptyText: string;
  feedbackByKey: Map<string, EngineFeedback>;
}) {
  return (
    <SectionCard title={title}>
      <div style={{ fontSize: 12, color: "#71717a", marginTop: -8, marginBottom: 12 }}>
        {subtitle}
      </div>
      {patterns.length === 0 ? (
        <div style={{ fontSize: 13, color: "#a1a1aa", padding: "12px 0" }}>
          {emptyText}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {patterns.map((p) => (
            <PatternCard
              key={p.id}
              pattern={p}
              feedback={
                feedbackByKey.get(`${p.pattern_key}|${p.industry ?? ""}`) ??
                null
              }
            />
          ))}
        </div>
      )}
    </SectionCard>
  );
}

type PageProps = {
  searchParams: Promise<{ industry?: string }>;
};

export default async function WhatsWorkingPage({ searchParams }: PageProps) {
  const supabase = await createClient();
  const { industry: industryFilterRaw } = await searchParams;
  const industryFilter = industryFilterRaw?.trim() || null;

  const { data: rawPatterns, error } = await supabase
    .from("global_learnings")
    .select("*")
    .order("consistency_score", { ascending: false })
    .order("times_seen", { ascending: false });

  const allPatterns = (rawPatterns ?? []) as GlobalLearning[];

  // Engine track record. The pattern_feedback table is small (one row per
  // pattern_key/industry that the engine has actually used) so we just
  // load the whole thing and build an in-memory lookup. Failing the query
  // — e.g. when the migration hasn't been applied to this DB yet — is
  // silently treated as "no engine verdicts to show", which is the
  // correct behaviour: the badge just doesn't render.
  const { data: feedbackRows } = await supabase
    .from("pattern_feedback")
    .select(
      "pattern_key, industry, engine_uses, positive_verdicts, negative_verdicts, neutral_verdicts, inconclusive_verdicts"
    );
  const feedbackByKey = new Map<string, EngineFeedback>();
  for (const f of (feedbackRows ?? []) as {
    pattern_key: string;
    industry: string | null;
    engine_uses: number;
    positive_verdicts: number;
    negative_verdicts: number;
    neutral_verdicts: number;
    inconclusive_verdicts: number;
  }[]) {
    feedbackByKey.set(`${f.pattern_key}|${f.industry ?? ""}`, {
      engine_uses: Number(f.engine_uses ?? 0),
      positive_verdicts: Number(f.positive_verdicts ?? 0),
      negative_verdicts: Number(f.negative_verdicts ?? 0),
      neutral_verdicts: Number(f.neutral_verdicts ?? 0),
      inconclusive_verdicts: Number(f.inconclusive_verdicts ?? 0),
    });
  }

  // Recent engine verdicts panel data. We pull the freshest measured
  // decision_outcomes rows, then look up their queue rows in a second
  // query to filter down to engine-driven (pattern-backed) decisions
  // only. Two queries is deliberate — PostgREST nested-filter syntax for
  // "embed exists AND nested column is not null" is fragile, and the
  // outcomes table is small enough that 30 rows + a follow-up `in()`
  // lookup is cheap. Keeping it lazy: if either query fails (e.g. tables
  // missing on a fresh DB) the panel just doesn't render.
  const { data: rawOutcomes } = await supabase
    .from("decision_outcomes")
    .select(
      "id, queue_id, decision_type, verdict, verdict_reason, ctr_lift_pct, cpm_change_pct, measured_at, client_id"
    )
    .eq("status", "measured")
    .not("verdict", "is", null)
    .order("measured_at", { ascending: false })
    .limit(30);

  type RawOutcome = {
    id: number;
    queue_id: number;
    decision_type: string;
    verdict: string | null;
    verdict_reason: string | null;
    ctr_lift_pct: number | null;
    cpm_change_pct: number | null;
    measured_at: string | null;
    client_id: number | null;
  };
  const outcomeRows = (rawOutcomes ?? []) as RawOutcome[];

  let engineVerdicts: EngineVerdictRow[] = [];

  if (outcomeRows.length > 0) {
    const queueIds = outcomeRows.map((o) => o.queue_id).filter(Boolean);
    const clientIds = Array.from(
      new Set(
        outcomeRows
          .map((o) => o.client_id)
          .filter((v): v is number => v !== null)
      )
    );

    const [{ data: queueRows }, { data: clientRows }] = await Promise.all([
      queueIds.length > 0
        ? supabase
            .from("meta_execution_queue")
            .select("id, source_pattern_key, source_pattern_industry")
            .in("id", queueIds)
        : Promise.resolve({ data: [] as { id: number; source_pattern_key: string | null; source_pattern_industry: string | null }[] }),
      clientIds.length > 0
        ? supabase.from("clients").select("id, name").in("id", clientIds)
        : Promise.resolve({ data: [] as { id: number; name: string }[] }),
    ]);

    const queueById = new Map(
      (queueRows ?? []).map((q) => [
        Number(q.id),
        {
          pattern_key: q.source_pattern_key,
          pattern_industry: q.source_pattern_industry,
        },
      ])
    );
    const clientById = new Map(
      (clientRows ?? []).map((c) => [Number(c.id), String(c.name)])
    );

    engineVerdicts = outcomeRows
      .map((o): EngineVerdictRow | null => {
        const q = queueById.get(Number(o.queue_id));
        if (!q || !q.pattern_key) return null;
        if (!o.verdict) return null;
        return {
          id: o.id,
          pattern_key: q.pattern_key,
          pattern_industry: q.pattern_industry,
          decision_type: o.decision_type,
          verdict: o.verdict,
          verdict_reason: o.verdict_reason,
          ctr_lift_pct: o.ctr_lift_pct !== null ? Number(o.ctr_lift_pct) : null,
          cpm_change_pct:
            o.cpm_change_pct !== null ? Number(o.cpm_change_pct) : null,
          measured_at: o.measured_at,
          client_name:
            o.client_id !== null ? clientById.get(o.client_id) ?? null : null,
        };
      })
      .filter((v): v is EngineVerdictRow => v !== null)
      .slice(0, 8);
  }

  // Discover every industry that has at least one row, before filtering, so
  // the pill row stays consistent regardless of which view is selected.
  // Sort alphabetically for stable rendering.
  const availableIndustries = Array.from(
    new Set(
      allPatterns
        .map((p) => p.industry)
        .filter((v): v is string => Boolean(v))
    )
  ).sort();

  // The filter splits the playbook into three modes:
  //   - null  → "all clients" view, show only industry=null rows (the
  //             cross-industry aggregates and all action-pattern rows)
  //   - <ind> → show only rows tagged with that industry
  //
  // We deliberately don't blend the two: mixing per-industry creative
  // findings with cross-industry ones would double-count the underlying
  // ads and make the panels look duplicative.
  const patterns = industryFilter
    ? allPatterns.filter((p) => p.industry === industryFilter)
    : allPatterns.filter((p) => p.industry === null);

  // Group by pattern_type
  const byType: Record<string, GlobalLearning[]> = {};
  for (const p of patterns) {
    if (!byType[p.pattern_type]) byType[p.pattern_type] = [];
    byType[p.pattern_type].push(p);
  }

  const hooks = byType.hook ?? [];
  const creatives = byType.creative ?? [];
  const audiences = byType.audience ?? [];
  const budgets = byType.budget ?? [];
  const failures = (byType.failure ?? []).sort(
    (a, b) => b.times_seen - a.times_seen
  );
  const fastWins = (byType.fast_win ?? []).sort((a, b) => {
    const aLift = a.avg_ctr_lift ?? 0;
    const bLift = b.avg_ctr_lift ?? 0;
    return bLift - aLift;
  });

  // Cross-client creative aggregation rows from generate-global-learnings.
  // Sort positives first, then by absolute lift size — operators want
  // "biggest winners" before "biggest losers" within the same panel.
  const sortByLift = (a: GlobalLearning, b: GlobalLearning) => {
    const aPos = (a.avg_ctr_lift ?? 0) >= 0 ? 1 : 0;
    const bPos = (b.avg_ctr_lift ?? 0) >= 0 ? 1 : 0;
    if (aPos !== bPos) return bPos - aPos;
    return Math.abs(b.avg_ctr_lift ?? 0) - Math.abs(a.avg_ctr_lift ?? 0);
  };
  const creativeFormats = (byType.creative_format ?? []).sort(sortByLift);
  const creativeHooks = (byType.creative_hook ?? []).sort(sortByLift);

  const lastUpdated =
    patterns.length > 0
      ? patterns
          .map((p) => p.last_updated)
          .filter(Boolean)
          .sort()
          .reverse()[0]
      : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div>
        <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>
          What&rsquo;s working right now
        </h2>
        <p style={{ fontSize: 14, color: "#71717a", margin: "4px 0 0" }}>
          Everything we&rsquo;ve tried, across every client, turned into one
          shared playbook. The more we run, the sharper this gets.
        </p>
        <p style={{ fontSize: 12, color: "#a1a1aa", margin: "6px 0 0" }}>
          Computed from the last 90 days of action outcomes and ad performance.
          Use Refresh everything for a full sync, or Regenerate Global Learnings
          to rebuild only the patterns.
        </p>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
          padding: 16,
          background: "linear-gradient(135deg,#fafafa,#f4f4f5)",
          border: "1px solid #e4e4e7",
          borderRadius: 12,
        }}
      >
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#18181b" }}>
            Playbook
          </div>
          <div style={{ fontSize: 12, color: "#71717a", marginTop: 2 }}>
            {patterns.length} proven move{patterns.length === 1 ? "" : "s"}
            {lastUpdated &&
              ` · last checked ${new Date(lastUpdated).toLocaleString()}`}
          </div>
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            gap: 8,
          }}
        >
          <RefreshEverythingButton />
          {/* Secondary "rebuild patterns only" escape hatch. Useful when
              testing the pattern_feedback loop or after hand-editing
              learnings — re-runs only step 5 of the pipeline (no Meta
              fetch, no scoring), so it lands in seconds. */}
          <GenerateGlobalLearningsButton />
        </div>
      </div>

      {engineVerdicts.length > 0 && (
        <RecentEngineVerdicts verdicts={engineVerdicts} />
      )}

      {availableIndustries.length > 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
            padding: "10px 14px",
            background: "#fff",
            border: "1px solid #e4e4e7",
            borderRadius: 12,
          }}
        >
          <span
            style={{
              fontSize: 12,
              color: "#71717a",
              fontWeight: 500,
              marginRight: 4,
            }}
          >
            Filter by industry:
          </span>
          <FilterPill
            href="/app/whats-working"
            label="All clients"
            active={industryFilter === null}
          />
          {availableIndustries.map((ind) => (
            <FilterPill
              key={ind}
              href={`/app/whats-working?industry=${encodeURIComponent(ind)}`}
              label={ind.charAt(0).toUpperCase() + ind.slice(1)}
              active={industryFilter === ind}
            />
          ))}
        </div>
      )}

      {error && (
        <div
          style={{
            padding: 12,
            background: "#fee2e2",
            color: "#991b1b",
            borderRadius: 8,
            fontSize: 13,
          }}
        >
          Failed to load global learnings: {error.message}
        </div>
      )}

      {patterns.length === 0 && !error && (
        <div
          style={{
            padding: 20,
            background: "#fff",
            border: "1px dashed #e4e4e7",
            borderRadius: 12,
            fontSize: 13,
            color: "#71717a",
            textAlign: "center",
          }}
        >
          Nothing to show yet. Run a few ads, mark the outcomes, then tap
          &ldquo;Refresh everything&rdquo; above to build the playbook.
        </div>
      )}

      {/* Cross-client creative aggregation — these are derived from the
          ads table, not from action_learnings. They answer "what creative
          attributes are working across the whole agency" rather than
          "what did operators do that worked". */}
      <Section
        title="Creative formats across the agency"
        subtitle="How ad formats compare against the average CTR across every client. Only formats seen on at least 2 clients."
        patterns={creativeFormats}
        emptyText="Not enough creative coverage yet — sync more ads, then re-run the playbook."
        feedbackByKey={feedbackByKey}
      />

      <Section
        title="Hook styles across the agency"
        subtitle="How hook types compare against the average CTR across every client."
        patterns={creativeHooks}
        emptyText="No cross-client hook patterns yet."
        feedbackByKey={feedbackByKey}
      />

      <Section
        title="Hooks that work"
        subtitle="Ways of opening the ad that got more people reading."
        patterns={hooks}
        emptyText="No hook wins yet."
        feedbackByKey={feedbackByKey}
      />

      <Section
        title="Images and videos that work"
        subtitle="Creative swaps that lifted performance when we tried them."
        patterns={creatives}
        emptyText="No creative wins yet."
        feedbackByKey={feedbackByKey}
      />

      <Section
        title="Audiences that work"
        subtitle="Who to show the ad to, based on what's actually converted."
        patterns={audiences}
        emptyText="No audience wins yet."
        feedbackByKey={feedbackByKey}
      />

      {budgets.length > 0 && (
        <Section
          title="When to spend more (and less)"
          subtitle="Budget moves that paid off or saved us money."
          patterns={budgets}
          emptyText="No budget wins yet."
          feedbackByKey={feedbackByKey}
        />
      )}

      <Section
        title="Quick wins spotted"
        subtitle="Things that worked on the first try. Promising but not yet proven."
        patterns={fastWins}
        emptyText="Nothing spotted yet."
        feedbackByKey={feedbackByKey}
      />

      <Section
        title="Mistakes to avoid"
        subtitle="Things that have burned us more than once. Don&rsquo;t repeat these."
        patterns={failures}
        emptyText="No recurring mistakes yet."
        feedbackByKey={feedbackByKey}
      />
    </div>
  );
}

// Recent engine verdicts panel — surfaces the latest pattern-backed
// decisions that the engine acted on, alongside how they actually
// played out. Distinct from the per-pattern badge on PatternCard:
// the badge is the *aggregate* track record for one pattern; this
// panel is the *individual* verdict timeline so the operator can
// eyeball "what did the engine just do, and was it right?".
function verdictColor(verdict: string): string {
  switch (verdict) {
    case "positive":
      return "#166534";
    case "negative":
      return "#991b1b";
    case "neutral":
      return "#92400e";
    default:
      return "#71717a"; // inconclusive / unknown
  }
}

function verdictLabel(verdict: string): string {
  switch (verdict) {
    case "positive":
      return "Worked";
    case "negative":
      return "Backfired";
    case "neutral":
      return "No change";
    case "inconclusive":
      return "Too early";
    default:
      return verdict;
  }
}

function humanAgo(iso: string | null): string {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return "just now";
  const m = Math.round(ms / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

function RecentEngineVerdicts({ verdicts }: { verdicts: EngineVerdictRow[] }) {
  return (
    <SectionCard title="Recent engine verdicts">
      <div
        style={{
          fontSize: 12,
          color: "#71717a",
          marginTop: -8,
          marginBottom: 12,
        }}
      >
        The latest pattern-backed moves the engine made, and how they
        landed once we measured them.
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {verdicts.map((v) => {
          const color = verdictColor(v.verdict);
          const liftParts: string[] = [];
          if (v.ctr_lift_pct !== null && v.ctr_lift_pct !== 0) {
            const dir = v.ctr_lift_pct > 0 ? "up" : "down";
            liftParts.push(
              `clicks ${dir} ${Math.abs(v.ctr_lift_pct).toFixed(0)}%`
            );
          }
          if (v.cpm_change_pct !== null && v.cpm_change_pct !== 0) {
            const dir = v.cpm_change_pct < 0 ? "cheaper" : "more expensive";
            liftParts.push(
              `${Math.abs(v.cpm_change_pct).toFixed(0)}% ${dir}`
            );
          }
          return (
            <div
              key={v.id}
              style={{
                padding: "10px 12px",
                background: "#fafafa",
                border: "1px solid #f4f4f5",
                borderRadius: 8,
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    flexWrap: "wrap",
                  }}
                >
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color,
                      padding: "2px 8px",
                      borderRadius: 999,
                      background: "#fff",
                      border: `1px solid ${color}33`,
                    }}
                  >
                    {verdictLabel(v.verdict)}
                  </span>
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: "#18181b",
                    }}
                  >
                    {v.pattern_key}
                  </span>
                  {v.pattern_industry && (
                    <span
                      style={{
                        fontSize: 11,
                        color: "#71717a",
                        textTransform: "capitalize",
                      }}
                    >
                      ({v.pattern_industry})
                    </span>
                  )}
                </div>
                <div
                  style={{ fontSize: 12, color: "#52525b", marginTop: 4 }}
                >
                  {v.client_name ?? "Unknown client"} ·{" "}
                  {v.decision_type.replaceAll("_", " ")}
                  {liftParts.length > 0 && ` · ${liftParts.join(", ")}`}
                </div>
                {v.verdict_reason && (
                  <div
                    style={{
                      fontSize: 11,
                      color: "#71717a",
                      marginTop: 4,
                      fontStyle: "italic",
                    }}
                  >
                    {v.verdict_reason}
                  </div>
                )}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: "#a1a1aa",
                  whiteSpace: "nowrap",
                  marginTop: 2,
                }}
              >
                {humanAgo(v.measured_at)}
              </div>
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}

function FilterPill({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "6px 12px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 600,
        textDecoration: "none",
        background: active ? "#18181b" : "#fafafa",
        color: active ? "#fff" : "#52525b",
        border: active ? "1px solid #18181b" : "1px solid #e4e4e7",
      }}
    >
      {label}
    </Link>
  );
}
