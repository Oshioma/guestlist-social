import { createClient } from "@/lib/supabase/server";
import SectionCard from "@/app/admin-panel/components/SectionCard";
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
  last_updated: string | null;
};

function fmtPct(n: number | null | undefined, digits = 0): string {
  if (n === null || n === undefined) return "—";
  const v = Number(n);
  if (Number.isNaN(v)) return "—";
  return `${v > 0 ? "+" : ""}${v.toFixed(digits)}%`;
}

function consistencyColor(score: number): string {
  if (score >= 75) return "#166534";
  if (score >= 50) return "#92400e";
  return "#991b1b";
}

function MetricChip({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "baseline",
        gap: 4,
        fontSize: 12,
      }}
    >
      <span style={{ color: "#71717a" }}>{label}</span>
      <span style={{ color: color ?? "#18181b", fontWeight: 600 }}>{value}</span>
    </span>
  );
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
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 8,
        }}
      >
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#18181b" }}>
            {pattern.pattern_label}
          </div>
          <div style={{ fontSize: 13, color: "#52525b", marginTop: 3 }}>
            {pattern.action_summary}
          </div>
        </div>
        <div
          style={{
            padding: "2px 10px",
            borderRadius: 999,
            fontSize: 11,
            fontWeight: 700,
            background: "#f4f4f5",
            color: consistencyColor(pattern.consistency_score),
            whiteSpace: "nowrap",
          }}
        >
          {pattern.consistency_score.toFixed(0)}% work
        </div>
      </div>

      <div
        style={{
          display: "flex",
          gap: 14,
          flexWrap: "wrap",
          padding: "6px 0",
          borderTop: "1px solid #f4f4f5",
          borderBottom: pattern.sample_learnings?.length ? "1px solid #f4f4f5" : "none",
        }}
      >
        <MetricChip label="Seen" value={`${pattern.times_seen}×`} />
        <MetricChip
          label="Clients"
          value={String(pattern.unique_clients)}
        />
        <MetricChip
          label="CTR lift"
          value={fmtPct(pattern.avg_ctr_lift, 1)}
          color={
            pattern.avg_ctr_lift && pattern.avg_ctr_lift > 0
              ? "#166534"
              : pattern.avg_ctr_lift && pattern.avg_ctr_lift < 0
              ? "#991b1b"
              : undefined
          }
        />
        <MetricChip
          label="CPC Δ"
          value={fmtPct(pattern.avg_cpc_change, 1)}
          color={
            pattern.avg_cpc_change && pattern.avg_cpc_change < 0
              ? "#166534"
              : pattern.avg_cpc_change && pattern.avg_cpc_change > 0
              ? "#991b1b"
              : undefined
          }
        />
        <MetricChip
          label="Score"
          value={
            pattern.avg_reliability !== null
              ? pattern.avg_reliability.toFixed(1)
              : "—"
          }
        />
        <MetricChip
          label="Outcomes"
          value={`${pattern.positive_count}✓ ${pattern.neutral_count}• ${pattern.negative_count}✗`}
        />
      </div>

      {pattern.sample_learnings && pattern.sample_learnings.length > 0 && (
        <div style={{ marginTop: 8 }}>
          {pattern.sample_learnings.slice(0, 2).map((s, i) => (
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

      {pattern.top_tags && pattern.top_tags.length > 0 && (
        <div
          style={{
            marginTop: 8,
            display: "flex",
            flexWrap: "wrap",
            gap: 4,
          }}
        >
          {pattern.top_tags.map((tag) => (
            <span
              key={tag}
              style={{
                fontSize: 10,
                padding: "1px 6px",
                borderRadius: 4,
                background: "#f4f4f5",
                color: "#71717a",
              }}
            >
              #{tag}
            </span>
          ))}
        </div>
      )}

      {total === 0 && (
        <div style={{ fontSize: 11, color: "#a1a1aa", marginTop: 6 }}>
          No outcome data yet.
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

export default async function WhatsWorkingPage() {
  const supabase = await createClient();

  const { data: rawPatterns, error } = await supabase
    .from("global_learnings")
    .select("*")
    .order("consistency_score", { ascending: false })
    .order("times_seen", { ascending: false });

  const patterns = (rawPatterns ?? []) as GlobalLearning[];

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
          What&rsquo;s Working Right Now
        </h2>
        <p style={{ fontSize: 14, color: "#71717a", margin: "4px 0 0" }}>
          Cross-client intelligence aggregated from every action taken on every
          ad. Patterns get stronger as more clients run them.
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
            Knowledge engine
          </div>
          <div style={{ fontSize: 12, color: "#71717a", marginTop: 2 }}>
            {patterns.length} pattern{patterns.length === 1 ? "" : "s"} indexed
            {lastUpdated &&
              ` · last updated ${new Date(lastUpdated).toLocaleString()}`}
          </div>
        </div>
        <GenerateGlobalLearningsButton />
      </div>

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
          No patterns yet. Complete a few ad actions across clients, then click
          &ldquo;Regenerate Global Learnings&rdquo; above to aggregate them.
        </div>
      )}

      <Section
        title="Top Performing Hooks"
        subtitle="Hook and copy changes that consistently lifted engagement."
        patterns={hooks}
        emptyText="No hook patterns yet."
      />

      <Section
        title="Top Creatives"
        subtitle="Creative swaps, tests and format changes ordered by consistency."
        patterns={creatives}
        emptyText="No creative patterns yet."
      />

      <Section
        title="Top Audiences"
        subtitle="Targeting moves that have repeatedly paid off."
        patterns={audiences}
        emptyText="No audience patterns yet."
      />

      {budgets.length > 0 && (
        <Section
          title="Budget Moves"
          subtitle="When to scale up, pull back, or pause."
          patterns={budgets}
          emptyText="No budget patterns yet."
        />
      )}

      <Section
        title="Fastest Wins"
        subtitle="Actions that worked on the first try — not proven yet, but promising."
        patterns={fastWins}
        emptyText="No fast wins recorded yet."
      />

      <Section
        title="Biggest Failures to Avoid"
        subtitle="Problem signatures that have burned multiple clients. Don&rsquo;t repeat these."
        patterns={failures}
        emptyText="No recurring failures yet."
      />
    </div>
  );
}
