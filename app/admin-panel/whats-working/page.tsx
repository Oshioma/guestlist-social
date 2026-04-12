import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import SectionCard from "@/app/admin-panel/components/SectionCard";
import RefreshEverythingButton from "@/app/admin-panel/components/RefreshEverythingButton";

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

function PatternCard({ pattern }: { pattern: GlobalLearning }) {
  const total = pattern.positive_count + pattern.neutral_count + pattern.negative_count;

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

      {total === 0 && (
        <div style={{ fontSize: 11, color: "#a1a1aa", marginTop: 6 }}>
          Not enough data to say for sure yet.
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
}: {
  title: string;
  subtitle: string;
  patterns: GlobalLearning[];
  emptyText: string;
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
            <PatternCard key={p.id} pattern={p} />
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
          Re-run from the Memory page after fresh data lands.
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
        <RefreshEverythingButton />
      </div>

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
      />

      <Section
        title="Hook styles across the agency"
        subtitle="How hook types compare against the average CTR across every client."
        patterns={creativeHooks}
        emptyText="No cross-client hook patterns yet."
      />

      <Section
        title="Hooks that work"
        subtitle="Ways of opening the ad that got more people reading."
        patterns={hooks}
        emptyText="No hook wins yet."
      />

      <Section
        title="Images and videos that work"
        subtitle="Creative swaps that lifted performance when we tried them."
        patterns={creatives}
        emptyText="No creative wins yet."
      />

      <Section
        title="Audiences that work"
        subtitle="Who to show the ad to, based on what's actually converted."
        patterns={audiences}
        emptyText="No audience wins yet."
      />

      {budgets.length > 0 && (
        <Section
          title="When to spend more (and less)"
          subtitle="Budget moves that paid off or saved us money."
          patterns={budgets}
          emptyText="No budget wins yet."
        />
      )}

      <Section
        title="Quick wins spotted"
        subtitle="Things that worked on the first try. Promising but not yet proven."
        patterns={fastWins}
        emptyText="Nothing spotted yet."
      />

      <Section
        title="Mistakes to avoid"
        subtitle="Things that have burned us more than once. Don&rsquo;t repeat these."
        patterns={failures}
        emptyText="No recurring mistakes yet."
      />
    </div>
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
