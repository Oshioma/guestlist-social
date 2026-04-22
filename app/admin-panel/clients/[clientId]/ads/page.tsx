import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import EmptyState from "@/app/admin-panel/components/EmptyState";
import SectionCard from "@/app/admin-panel/components/SectionCard";
import { formatCurrency } from "@/app/admin-panel/lib/utils";
import {
  getAppPerformanceStatus,
  getPerformanceScore,
  explainPerformanceStatus,
} from "@/app/admin-panel/lib/performance-truth";
import type { AppPerformanceStatus } from "@/app/admin-panel/lib/performance-truth";
import { getActionSuggestion } from "@/app/admin-panel/lib/action-engine";
import ScoreAndGenerateButton from "@/app/admin-panel/components/ScoreAndGenerateButton";
import AdsPageTabs from "@/app/admin-panel/components/AdsPageTabs";
import DecisionAccuracy from "@/app/admin-panel/components/DecisionAccuracy";
import AdActionRow from "@/app/admin-panel/components/AdActionRow";
import {
  deriveConfidence,
  formatEvidence,
  formatExpectedOutcome,
  formatLastSimilar,
  formatDecisionEvidence,
  formatDecisionLastSimilar,
  type PatternStats,
  type LastSimilar,
  type DecisionTypeStats,
  type LastDecision,
} from "@/app/admin-panel/lib/action-confidence";
import ExperimentCard from "@/app/admin-panel/components/ExperimentCard";
import CreateExperimentForm from "@/app/admin-panel/components/CreateExperimentForm";
import GeneratePlaybookButton from "@/app/admin-panel/components/GeneratePlaybookButton";
import DecisionRow from "@/app/admin-panel/components/DecisionRow";
import GenerateDecisionsButton from "@/app/admin-panel/components/GenerateDecisionsButton";
import PreviewDecisionsButton from "@/app/admin-panel/components/PreviewDecisionsButton";
import ScaleAdButton from "@/app/admin-panel/components/ScaleAdButton";
import PullBackAdButton from "@/app/admin-panel/components/PullBackAdButton";

export const dynamic = "force-dynamic";

const perfColors: Record<string, { bg: string; text: string }> = {
  winner: { bg: "#dcfce7", text: "#166534" },
  losing: { bg: "#fee2e2", text: "#991b1b" },
  testing: { bg: "#fef3c7", text: "#92400e" },
  paused: { bg: "#f4f4f5", text: "#71717a" },
};

const priorityColors: Record<string, { bg: string; text: string }> = {
  high: { bg: "#fee2e2", text: "#991b1b" },
  medium: { bg: "#fef3c7", text: "#92400e" },
  low: { bg: "#f4f4f5", text: "#71717a" },
};

export default async function ClientAdsPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  const supabase = await createClient();

  const { getEngineThresholds } = await import("@/lib/app-settings");
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const engineThresholds = await getEngineThresholds(createAdminClient());

  // Window the ads list to the last 6 months. Old ads were dragging the
  // page down with rows whose Meta CDN creative URLs had long since
  // expired (rendering as "No preview"), and they pollute the totals
  // strip with stale £/impressions numbers that have nothing to do with
  // anything the operator can act on now. The cutoff is computed from
  // the request time so it always means "the last 6 months from today".
  const SIX_MONTHS_MS = 1000 * 60 * 60 * 24 * 30 * 6;
  const adsCutoffIso = new Date(Date.now() - SIX_MONTHS_MS).toISOString();

  const [clientRes, adsRes, actionsRes, learningsRes, experimentsRes, playbookRes, decisionsRes, outcomesRes] = await Promise.all([
    supabase.from("clients").select("id, name").eq("id", clientId).single(),
    supabase
      .from("ads")
      .select("*, campaigns(id, name)")
      .eq("client_id", clientId)
      .gte("created_at", adsCutoffIso)
      .order("created_at", { ascending: false }),
    supabase
      .from("ad_actions")
      .select("*, ads!inner(name, client_id, creative_image_url, creative_video_url)")
      .eq("ads.client_id", clientId)
      .order("created_at", { ascending: false }),
    supabase
      .from("action_learnings")
      .select("*")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false }),
    supabase
      .from("experiments")
      .select("*, experiment_variants(*, ads(id, name))")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false }),
    supabase
      .from("client_playbooks")
      .select("*")
      .eq("client_id", clientId)
      .order("avg_reliability", { ascending: false }),
    supabase
      .from("ad_decisions")
      .select("*, ads(name, creative_image_url, creative_video_url)")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false }),
    supabase
      .from("decision_outcomes")
      .select("id, ad_id, decision_type, verdict, verdict_reason, ctr_lift_pct, cpm_change_pct, status, measured_at")
      .eq("client_id", clientId)
      .eq("status", "measured")
      .order("measured_at", { ascending: false })
      .limit(200),
  ]);

  if (clientRes.error || !clientRes.data) {
    return <EmptyState title="Client not found" />;
  }

  const client = clientRes.data;
  const rawAds = adsRes.data ?? [];
  const rawActions = actionsRes.data ?? [];

  // Build a map of ad_id → latest measured outcome for badge display.
  const rawOutcomes = outcomesRes.data ?? [];
  const outcomeByAdId = new Map<number, {
    verdict: string;
    ctr_lift_pct: number | null;
    verdict_reason: string | null;
    measured_at: string | null;
  }>();
  for (const o of rawOutcomes as any[]) {
    if (o.ad_id && !outcomeByAdId.has(o.ad_id)) {
      outcomeByAdId.set(o.ad_id, {
        verdict: o.verdict,
        ctr_lift_pct: o.ctr_lift_pct != null ? Number(o.ctr_lift_pct) : null,
        verdict_reason: o.verdict_reason,
        measured_at: o.measured_at,
      });
    }
  }
  const learnings = learningsRes.data ?? [];
  const rawExperiments = experimentsRes.data ?? [];
  const playbook = playbookRes.data ?? [];
  const rawDecisions = decisionsRes.data ?? [];
  const pendingDecisions = rawDecisions.filter((d: any) => d.status === "pending");
  const pastDecisions = rawDecisions.filter((d: any) => d.status !== "pending");

  // Group actions by priority
  const pendingActions = rawActions.filter((a: any) => a.status === "pending" || a.status === "in_progress");
  const completedActions = rawActions.filter((a: any) => a.status === "completed");
  const highPriorityActions = pendingActions.filter((a: any) => a.priority === "high");
  const mediumPriorityActions = pendingActions.filter((a: any) => a.priority === "medium");
  const lowPriorityActions = pendingActions.filter((a: any) => a.priority === "low");

  // ── Trust enrichment ────────────────────────────────────────────────────
  // Pull the global pattern stats + the most recent completed similar action
  // for every pattern_key referenced by a pending action. The action card
  // uses these to render confidence, evidence and a "last similar move" line.
  const patternKeys = Array.from(
    new Set(
      pendingActions
        .map((a: any) => a.validated_pattern_key)
        .filter((k: any): k is string => typeof k === "string" && k.length > 0)
    )
  );

  const patternStatsByKey = new Map<string, PatternStats>();
  const lastSimilarByKey = new Map<string, LastSimilar>();

  if (patternKeys.length > 0) {
    const [globalRes, similarRes] = await Promise.all([
      supabase
        .from("global_learnings")
        .select(
          "pattern_key, pattern_label, action_summary, times_seen, unique_clients, positive_count, neutral_count, negative_count, consistency_score, avg_ctr_lift, avg_cpc_change"
        )
        .in("pattern_key", patternKeys),
      supabase
        .from("ad_actions")
        .select(
          "validated_pattern_key, outcome, completed_at, metric_snapshot_before, metric_snapshot_after, ads(name)"
        )
        .in("validated_pattern_key", patternKeys)
        .eq("status", "completed")
        .not("completed_at", "is", null)
        .order("completed_at", { ascending: false })
        .limit(200),
    ]);

    for (const row of globalRes.data ?? []) {
      patternStatsByKey.set((row as any).pattern_key, row as PatternStats);
    }

    // Take the most recent completed action per pattern_key — the query is
    // already ordered desc, so the first hit per key wins.
    for (const row of similarRes.data ?? []) {
      const key = (row as any).validated_pattern_key as string;
      if (lastSimilarByKey.has(key)) continue;
      const before = (row as any).metric_snapshot_before as
        | Record<string, number>
        | null;
      const after = (row as any).metric_snapshot_after as
        | Record<string, number>
        | null;
      const adRel = (row as any).ads;
      const adName = Array.isArray(adRel)
        ? adRel[0]?.name ?? null
        : adRel?.name ?? null;
      lastSimilarByKey.set(key, {
        ad_name: adName,
        outcome: (row as any).outcome ?? null,
        ctr_before: before?.ctr ?? null,
        ctr_after: after?.ctr ?? null,
        completed_at: (row as any).completed_at ?? null,
      });
    }
  }

  // ── Decision enrichment ─────────────────────────────────────────────────
  // Decisions are typed (scale_budget, pause_or_replace, ...). The trust
  // story for a pending decision is the history of past decisions of the
  // same type — both on this client and across all clients. We pull both
  // batches once and aggregate in JS.
  const pendingDecisionTypes = Array.from(
    new Set(
      pendingDecisions
        .map((d: any) => d.type)
        .filter((t: any): t is string => typeof t === "string" && t.length > 0)
    )
  );

  const decisionStatsByType = new Map<string, DecisionTypeStats>();
  const lastDecisionByType = new Map<string, LastDecision>();

  if (pendingDecisionTypes.length > 0) {
    const { data: historyRows } = await supabase
      .from("ad_decisions")
      .select(
        "type, status, executed_at, execution_result, ads(name)"
      )
      .in("type", pendingDecisionTypes)
      .neq("status", "pending")
      .order("executed_at", { ascending: false, nullsFirst: false })
      .limit(500);

    for (const row of historyRows ?? []) {
      const type = (row as any).type as string;
      const status = (row as any).status as string;

      // Aggregate counts per type
      const stats = decisionStatsByType.get(type) ?? {
        type,
        total: 0,
        executed: 0,
        approved: 0,
        rejected: 0,
      };
      stats.total += 1;
      if (status === "executed") stats.executed += 1;
      else if (status === "approved") stats.approved += 1;
      else if (status === "rejected") stats.rejected += 1;
      decisionStatsByType.set(type, stats);

      // First row wins (the query is already sorted recent-first)
      if (!lastDecisionByType.has(type) && status !== "rejected") {
        const adRel = (row as any).ads;
        const adName = Array.isArray(adRel)
          ? adRel[0]?.name ?? null
          : adRel?.name ?? null;
        lastDecisionByType.set(type, {
          ad_name: adName,
          status,
          executed_at: (row as any).executed_at ?? null,
          execution_result: (row as any).execution_result ?? null,
        });
      }
    }
  }

  function decisionCardProps(d: any) {
    const type = d.type as string | null;
    const stats = type ? decisionStatsByType.get(type) ?? null : null;
    const last = type ? lastDecisionByType.get(type) ?? null : null;
    return {
      id: d.id,
      ad_id: d.ad_id,
      client_id: Number(clientId),
      ad_name: (d.ads as any)?.name ?? "Unknown ad",
      type: d.type,
      reason: d.reason,
      action: d.action,
      confidence: d.confidence,
      meta_action: d.meta_action,
      status: d.status,
      execution_result: d.execution_result,
      approved_by: d.approved_by ?? null,
      evidence: formatDecisionEvidence(stats),
      last_similar: formatDecisionLastSimilar(last),
      creative_image_url: (d.ads as any)?.creative_image_url ?? null,
      creative_video_url: (d.ads as any)?.creative_video_url ?? null,
    };
  }

  // Build the props bag once per row so the JSX below stays small.
  function actionCardProps(a: any, defaultPriority: string) {
    const key = a.validated_pattern_key as string | null;
    const stats = key ? patternStatsByKey.get(key) ?? null : null;
    const lastSimilar = key ? lastSimilarByKey.get(key) ?? null : null;
    return {
      id: a.id,
      ad_id: a.ad_id,
      client_id: Number(clientId),
      ad_name: (a.ads as any)?.name ?? "Unknown ad",
      problem: a.problem ?? "",
      action: a.action ?? "",
      priority: a.priority ?? defaultPriority,
      status: a.status ?? "pending",
      hypothesis: a.hypothesis,
      validated_by: a.validated_by,
      outcome: a.outcome,
      result_summary: a.result_summary,
      metric_snapshot_before: a.metric_snapshot_before,
      metric_snapshot_after: a.metric_snapshot_after,
      completed_at: a.completed_at,
      confidence: deriveConfidence(stats),
      evidence: formatEvidence(stats),
      expected_outcome: formatExpectedOutcome(stats),
      last_similar: formatLastSimilar(lastSimilar),
      creative_image_url: (a.ads as any)?.creative_image_url ?? null,
      creative_video_url: (a.ads as any)?.creative_video_url ?? null,
    };
  }

  // Score every ad
  const ads = rawAds.map((ad) => {
    const impressions = Number(ad.impressions ?? 0);
    const clicks = Number(ad.clicks ?? 0);
    const spend = Number(ad.spend ?? 0);
    const ctr = impressions > 0 ? Number(((clicks / impressions) * 100).toFixed(2)) : 0;
    const cpc = clicks > 0 ? Number((spend / clicks).toFixed(4)) : 0;

    const forScoring = {
      status: ad.status,
      meta_status: ad.meta_status,
      spend,
      impressions,
      clicks,
      ctr,
      cpc,
      conversions: Number(ad.conversions ?? 0),
      cost_per_result: Number(ad.cost_per_result ?? 0),
    };

    return {
      ...ad,
      _spend: spend,
      _impressions: impressions,
      _clicks: clicks,
      _ctr: ctr,
      _cpc: cpc,
      _conversions: Number(ad.conversions ?? 0),
      _perfStatus: getAppPerformanceStatus(forScoring, engineThresholds),
      _perfScore: getPerformanceScore(forScoring, engineThresholds),
      _perfReason: explainPerformanceStatus(forScoring, engineThresholds),
      _campaignName: (ad.campaigns as any)?.name ?? "No campaign",
      _suggestion: getActionSuggestion({
        performance_status: getAppPerformanceStatus(forScoring, engineThresholds),
        performance_reason: explainPerformanceStatus(forScoring, engineThresholds),
      }),
    };
  });

  // Build a map of ad_id → pending action for badge display
  const adActionMap = new Map<number, { problem: string; action: string; priority: string }>();
  for (const a of pendingActions) {
    if (!adActionMap.has(a.ad_id)) {
      adActionMap.set(a.ad_id, {
        problem: a.problem ?? "",
        action: a.action ?? "",
        priority: a.priority ?? "medium",
      });
    }
  }

  const totalSpend = ads.reduce((sum, ad) => sum + ad._spend, 0);
  const totalImpressions = ads.reduce((sum, ad) => sum + ad._impressions, 0);
  const totalClicks = ads.reduce((sum, ad) => sum + ad._clicks, 0);
  const overallCtr =
    totalImpressions > 0
      ? ((totalClicks / totalImpressions) * 100).toFixed(2)
      : null;

  const winners = ads.filter((a) => a._perfStatus === "winner").length;
  const losing = ads.filter((a) => a._perfStatus === "losing").length;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 24,
        background:
          "linear-gradient(180deg, #f6f7f8 0%, #f1f3f5 45%, #eef1f4 100%)",
        borderRadius: 20,
        padding: 14,
      }}
    >
      <div
        style={{
          borderRadius: 16,
          padding: "18px 18px 16px",
          border: "1px solid rgba(16,24,40,0.06)",
          background:
            "linear-gradient(180deg, rgba(255,255,255,0.9), rgba(250,250,251,0.76))",
          boxShadow: "0 12px 30px rgba(16, 24, 40, 0.06)",
        }}
      >
        <Link
          href={`/app/clients/${clientId}`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 13,
            color: "#71717a",
            textDecoration: "none",
            marginBottom: 14,
          }}
        >
          &larr; Back to {client.name}
        </Link>

        <h2 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>
          {client.name} — Ads ({ads.length})
        </h2>
        <p style={{ fontSize: 13, color: "#71717a", margin: "6px 0 0" }}>
          Scored by CTR, CPC, conversions and spend. Last 6 months.
        </p>
        <div style={{ marginTop: 12, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <ScoreAndGenerateButton clientId={clientId} />
          <Link
            href="/app/meta-queue"
            style={{
              display: "inline-flex",
              alignItems: "center",
              padding: "8px 14px",
              borderRadius: 8,
              border: "1px solid #e4e4e7",
              background: "#fff",
              color: "#18181b",
              textDecoration: "none",
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            Meta queue
          </Link>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: 12,
        }}
      >
        {[
          { label: "Total Ads", value: String(ads.length) },
          { label: "Winners", value: String(winners), color: "#166534" },
          { label: "Losing", value: String(losing), color: "#991b1b" },
          { label: "Total Spend", value: formatCurrency(totalSpend) },
          { label: "Impressions", value: totalImpressions.toLocaleString() },
          { label: "CTR", value: overallCtr ? `${overallCtr}%` : "—" },
        ].map((stat) => (
          <div
            key={stat.label}
            style={{
              border: "1px solid rgba(16,24,40,0.06)",
              borderRadius: 18,
              padding: 16,
              background: "rgba(255,255,255,0.78)",
              backdropFilter: "blur(8px)",
              boxShadow: "0 10px 24px rgba(16, 24, 40, 0.04)",
            }}
          >
            <div style={{ fontSize: 12, color: "#71717a" }}>{stat.label}</div>
            <div
              style={{
                marginTop: 6,
                fontSize: 22,
                fontWeight: 700,
                color: stat.color ?? "#18181b",
              }}
            >
              {stat.value}
            </div>
          </div>
        ))}
      </div>

      <AdsPageTabs
        counts={{
          ads: ads.length,
          actions: pendingActions.length,
          decisions: pendingDecisions.length,
          playbook: playbook.length,
          experiments: rawExperiments.length,
          learnings: learnings.length,
        }}
        actionsPanel={
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            {/* ── ACTION QUEUE ── */}
            {pendingActions.length > 0 && (
              <SectionCard title={`Action Queue (${pendingActions.length})`}>
          <p style={{ fontSize: 12, color: "#71717a", margin: "0 0 14px" }}>
            Here&apos;s exactly what you need to do. Fix high priority first.
          </p>

          {highPriorityActions.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 8,
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: "#dc2626",
                    display: "inline-block",
                  }}
                />
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: "#991b1b",
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                  }}
                >
                  High Priority ({highPriorityActions.length})
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {highPriorityActions.map((a: any) => (
                  <div key={a.id} id={`action-${a.id}`} style={{ scrollMarginTop: 80 }}>
                    <AdActionRow action={actionCardProps(a, "high")} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {mediumPriorityActions.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 8,
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: "#d97706",
                    display: "inline-block",
                  }}
                />
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: "#92400e",
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                  }}
                >
                  Medium Priority ({mediumPriorityActions.length})
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {mediumPriorityActions.map((a: any) => (
                  <div key={a.id} id={`action-${a.id}`} style={{ scrollMarginTop: 80 }}>
                    <AdActionRow action={actionCardProps(a, "medium")} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {lowPriorityActions.length > 0 && (
            <div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 8,
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: "#a1a1aa",
                    display: "inline-block",
                  }}
                />
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: "#71717a",
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                  }}
                >
                  Low Priority ({lowPriorityActions.length})
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {lowPriorityActions.map((a: any) => (
                  <div key={a.id} id={`action-${a.id}`} style={{ scrollMarginTop: 80 }}>
                    <AdActionRow action={actionCardProps(a, "low")} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {completedActions.length > 0 && (
            <details style={{ marginTop: 16 }}>
              <summary style={{ fontSize: 12, color: "#71717a", cursor: "pointer" }}>
                {completedActions.length} completed actions
              </summary>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
                {completedActions.map((a: any) => (
                  <div key={a.id} id={`action-${a.id}`} style={{ scrollMarginTop: 80 }}>
                    <AdActionRow action={actionCardProps(a, "medium")} />
                  </div>
                ))}
              </div>
            </details>
          )}
        </SectionCard>
            )}

            {/* ── DECISIONS ── */}
            <SectionCard title={`Decisions (${pendingDecisions.length} pending)`}>
              <p style={{ fontSize: 13, color: "#52525b", margin: "0 0 12px" }}>
                Ask the engine what to do about this client&apos;s ads. Preview first
                to see what it would suggest, then run it for real when you&apos;re
                happy.
              </p>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 16,
                  marginBottom: 16,
                }}
              >
                <PreviewDecisionsButton clientId={clientId} />
                <GenerateDecisionsButton clientId={clientId} />
              </div>
              {pendingDecisions.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {pendingDecisions.map((d: any) => (
                    <div key={d.id} id={`decision-${d.id}`} style={{ scrollMarginTop: 80 }}>
                      <DecisionRow decision={decisionCardProps(d)} />
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ fontSize: 13, color: "#a1a1aa" }}>
                  No saved decisions yet. Run the engine above to fill this section.
                </p>
              )}
              {pastDecisions.length > 0 && (
                <details style={{ marginTop: 12 }}>
                  <summary style={{ fontSize: 12, color: "#71717a", cursor: "pointer" }}>
                    {pastDecisions.length} past decisions
                  </summary>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
                    {pastDecisions.map((d: any) => (
                      <div key={d.id} id={`decision-${d.id}`} style={{ scrollMarginTop: 80 }}>
                        <DecisionRow decision={decisionCardProps(d)} />
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </SectionCard>
          </div>
        }
        adsPanel={
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            {/* ── ALL ADS grouped by campaign ── */}
      <SectionCard title={`All ads · last 6 months (${ads.length})`}>
        {ads.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {(() => {
              const groups = new Map<string, typeof ads>();
              for (const ad of ads) {
                const key = ad._campaignName;
                if (!groups.has(key)) groups.set(key, []);
                groups.get(key)!.push(ad);
              }
              return Array.from(groups.entries()).map(([campaignName, campaignAds]) => (
                <div key={campaignName}>
                  <div
                    style={{
                      position: "sticky",
                      top: 0,
                      zIndex: 5,
                      padding: "8px 14px",
                      background: "#f9fafb",
                      border: "1px solid #e4e4e7",
                      borderRadius: 10,
                      marginBottom: 10,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#27272a" }}>
                      {campaignName}
                    </span>
                    <span style={{ fontSize: 12, color: "#71717a" }}>
                      {campaignAds.length} ad{campaignAds.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {campaignAds.map((ad) => {
              const colors = perfColors[ad._perfStatus] ?? perfColors.testing;

              return (
                <div
                  key={ad.id}
                  style={{
                    border: "1px solid #e4e4e7",
                    borderRadius: 16,
                    padding: 16,
                    background: "#fff",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 16,
                      alignItems: "flex-start",
                      flexWrap: "wrap",
                    }}
                  >
                    <div style={{ display: "flex", gap: 14, flex: 1, minWidth: 0 }}>
                      {/* Creative thumbnail — gives the operator instant
                          visual recall of which ad they're looking at
                          before reading the name. Image first, video poster
                          fallback, neutral placeholder if neither is
                          available. */}
                      <Link
                        href={`/app/clients/${clientId}/ads/${ad.id}`}
                        style={{
                          flexShrink: 0,
                          width: 100,
                          height: 100,
                          borderRadius: 10,
                          overflow: "hidden",
                          background: "#f4f4f5",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: "#a1a1aa",
                          fontSize: 10,
                          textDecoration: "none",
                          border: "1px solid #e4e4e7",
                        }}
                        title="Open audit trail"
                      >
                        {ad.creative_image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={ad.creative_image_url}
                            alt=""
                            loading="lazy"
                            style={{
                              width: "100%",
                              height: "100%",
                              objectFit: "cover",
                            }}
                          />
                        ) : ad.creative_video_url ? (
                          <video
                            src={ad.creative_video_url}
                            muted
                            playsInline
                            preload="metadata"
                            style={{
                              width: "100%",
                              height: "100%",
                              objectFit: "cover",
                              background: "#000",
                            }}
                          />
                        ) : (
                          <span>No preview</span>
                        )}
                      </Link>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                        }}
                      >
                        <Link
                          href={`/app/clients/${clientId}/ads/${ad.id}`}
                          style={{
                            fontSize: 15,
                            fontWeight: 600,
                            color: "#18181b",
                            textDecoration: "none",
                          }}
                          title="Open audit trail"
                        >
                          {ad.name}
                        </Link>
                        <span
                          style={{
                            padding: "2px 10px",
                            borderRadius: 999,
                            fontSize: 12,
                            fontWeight: 600,
                            background: colors.bg,
                            color: colors.text,
                            textTransform: "capitalize",
                          }}
                        >
                          {ad._perfStatus}
                        </span>
                        <span
                          style={{
                            fontSize: 13,
                            fontWeight: 700,
                            color:
                              ad._perfScore >= 3
                                ? "#166534"
                                : ad._perfScore <= -2
                                ? "#991b1b"
                                : "#71717a",
                          }}
                        >
                          {ad._perfScore > 0 ? `+${ad._perfScore}` : ad._perfScore}
                        </span>
                      </div>
                      <p
                        style={{
                          margin: "4px 0 0",
                          fontSize: 12,
                          color: "#71717a",
                        }}
                      >
                        {ad._perfReason}
                      </p>
                      <p
                        style={{
                          margin: "2px 0 0",
                          fontSize: 12,
                          color: "#a1a1aa",
                        }}
                      >
                        Campaign: {ad._campaignName}
                      </p>
                      {ad.audience ? (
                        <p
                          style={{
                            margin: "2px 0 0",
                            fontSize: 12,
                            color: "#a1a1aa",
                          }}
                        >
                          Audience: {ad.audience}
                        </p>
                      ) : null}

                      {/* Action badge — show queued action or suggestion */}
                      {(() => {
                        const queued = adActionMap.get(ad.id);
                        const source = queued ?? ad._suggestion;
                        if (!source) return null;

                        const isOpportunity = /winning|winner|scale/i.test(source.problem);
                        const actionLabels: Record<string, string> = {
                          high: "Fix",
                          medium: isOpportunity ? "Scale" : "Optimize",
                          low: "Monitor",
                        };
                        const actionBadge = queued
                          ? actionLabels[source.priority] ?? "Action"
                          : "";

                        return (
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 10,
                              marginTop: 8,
                              padding: "8px 12px",
                              borderRadius: 10,
                              background: queued ? (
                                isOpportunity ? "#ecfdf5" :
                                source.priority === "high" ? "#fef2f2" :
                                source.priority === "medium" ? "#fffbeb" : "#fafafa"
                              ) : "#fafafa",
                              border: `1px solid ${
                                queued ? (
                                  isOpportunity ? "#bbf7d0" :
                                  source.priority === "high" ? "#fecaca" :
                                  source.priority === "medium" ? "#fde68a" : "#e4e4e7"
                                ) : "#f4f4f5"
                              }`,
                              fontSize: 13,
                              lineHeight: 1.4,
                            }}
                          >
                            {queued && isOpportunity ? (
                              <ScaleAdButton
                                adId={ad.id}
                                hasAdsetMetaId={Boolean(ad.adset_meta_id)}
                              />
                            ) : queued ? (
                              <>
                                <span
                                  style={{
                                    padding: "2px 9px",
                                    borderRadius: 999,
                                    fontSize: 11,
                                    fontWeight: 700,
                                    background:
                                      priorityColors[source.priority]?.text ?? "#71717a",
                                    color: "#fff",
                                    textTransform: "uppercase",
                                    flexShrink: 0,
                                  }}
                                >
                                  {actionBadge}
                                </span>
                                {ad.adset_meta_id ? (
                                  <PullBackAdButton
                                    adId={ad.id}
                                    hasAdsetMetaId={true}
                                  />
                                ) : null}
                              </>
                            ) : null}
                            <span
                              style={{
                                color: isOpportunity ? "#166534" : "#991b1b",
                                fontWeight: 500,
                              }}
                            >
                              {isOpportunity ? "Opportunity" : "Problem"}: {source.problem}
                            </span>
                            <span style={{ color: "#71717a" }}>→</span>
                            <span style={{ color: "#18181b" }}>
                              {source.action}
                            </span>
                          </div>
                        );
                      })()}

                      {(() => {
                        const outcome = outcomeByAdId.get(ad.id);
                        if (!outcome) return null;
                        const verdictColors: Record<string, { bg: string; text: string; border: string }> = {
                          positive: { bg: "#ecfdf5", text: "#166534", border: "#bbf7d0" },
                          neutral: { bg: "#fffbeb", text: "#92400e", border: "#fde68a" },
                          negative: { bg: "#fef2f2", text: "#991b1b", border: "#fecaca" },
                          inconclusive: { bg: "#f8fafc", text: "#64748b", border: "#e2e8f0" },
                        };
                        const vc = verdictColors[outcome.verdict] ?? verdictColors.inconclusive;
                        const lift = outcome.ctr_lift_pct;
                        const liftLabel = lift != null
                          ? `${lift > 0 ? "+" : ""}${lift.toFixed(1)}% CTR`
                          : null;

                        return (
                          <div
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 8,
                              marginTop: 6,
                              padding: "5px 10px",
                              borderRadius: 8,
                              background: vc.bg,
                              border: `1px solid ${vc.border}`,
                              fontSize: 11,
                              fontWeight: 600,
                            }}
                            title={outcome.verdict_reason ?? undefined}
                          >
                            <span style={{ color: vc.text, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                              {outcome.verdict}
                            </span>
                            {liftLabel && (
                              <span style={{ color: vc.text }}>{liftLabel}</span>
                            )}
                            {outcome.measured_at && (
                              <span style={{ color: "#a1a1aa", fontWeight: 400 }}>
                                {new Date(outcome.measured_at).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                    </div>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(6, minmax(0, 1fr))",
                      gap: 12,
                      marginTop: 12,
                    }}
                  >
                    {[
                      { label: "Spend", value: formatCurrency(ad._spend) },
                      { label: "Impressions", value: ad._impressions.toLocaleString() },
                      { label: "Clicks", value: ad._clicks.toLocaleString() },
                      { label: "CTR", value: ad._ctr > 0 ? `${ad._ctr}%` : "—" },
                      { label: "CPC", value: ad._cpc > 0 ? formatCurrency(ad._cpc) : "—" },
                      { label: "Conversions", value: String(ad._conversions) },
                    ].map((stat) => (
                      <div
                        key={stat.label}
                        style={{
                          border: "1px solid #f4f4f5",
                          borderRadius: 12,
                          padding: 10,
                          background: "#fafafa",
                        }}
                      >
                        <div style={{ fontSize: 11, color: "#71717a" }}>
                          {stat.label}
                        </div>
                        <div
                          style={{ marginTop: 2, fontSize: 14, fontWeight: 600 }}
                        >
                          {stat.value}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
                  </div>
                </div>
              ));
            })()}
          </div>
        ) : (
          <EmptyState
            title="No ads yet"
            description="Ads will appear here once campaigns are synced or created."
          />
        )}
      </SectionCard>
          </div>
        }
        playbookPanel={
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            <DecisionAccuracy />
            {/* ── PLAYBOOK ── */}
      <SectionCard title={`${client.name} Playbook`}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <GeneratePlaybookButton clientId={clientId} />
        </div>
        {playbook.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {playbook.map((p: any) => {
              const catLabels: Record<string, string> = {
                winning_hooks: "Winning Hooks",
                winning_formats: "Winning Formats",
                failing_patterns: "Failing Patterns",
                audience_insights: "Audience Insights",
                budget_rules: "Budget Rules",
              };
              const catColors: Record<string, { bg: string; text: string }> = {
                winning_hooks: { bg: "#dcfce7", text: "#166534" },
                winning_formats: { bg: "#dbeafe", text: "#1e40af" },
                failing_patterns: { bg: "#fee2e2", text: "#991b1b" },
                audience_insights: { bg: "#fef3c7", text: "#92400e" },
                budget_rules: { bg: "#f4f4f5", text: "#52525b" },
              };
              const cc = catColors[p.category] ?? catColors.budget_rules;

              return (
                <div
                  key={p.id}
                  style={{
                    border: "1px solid #e4e4e7",
                    borderRadius: 10,
                    padding: 12,
                    background: "#fff",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span
                      style={{
                        padding: "2px 10px",
                        borderRadius: 999,
                        fontSize: 11,
                        fontWeight: 600,
                        background: cc.bg,
                        color: cc.text,
                      }}
                    >
                      {catLabels[p.category] ?? p.category}
                    </span>
                    <span style={{ fontSize: 11, color: "#71717a" }}>
                      {p.supporting_count} supporting learnings
                    </span>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: Number(p.avg_reliability) >= 50 ? "#166534" : "#92400e",
                      }}
                    >
                      {Number(p.avg_reliability).toFixed(0)}% reliable
                    </span>
                  </div>
                  <p style={{ margin: "6px 0 0", fontSize: 13, color: "#18181b", lineHeight: 1.5 }}>
                    {p.insight}
                  </p>
                </div>
              );
            })}
          </div>
        ) : (
          <p style={{ fontSize: 13, color: "#a1a1aa" }}>
            No playbook yet. Complete some actions and generate learnings first, then hit Generate Playbook.
          </p>
        )}
      </SectionCard>

      {learnings.length > 0 && (() => {
        const sorted = [...learnings].sort(
          (a: any, b: any) => Number(b.reliability_score ?? 0) - Number(a.reliability_score ?? 0)
        );
        return (
          <SectionCard title={`Learnings (${learnings.length})`}>
            <p style={{ fontSize: 12, color: "#71717a", margin: "0 0 12px" }}>
              Ranked by reliability. Repeated, consistent learnings rise to the top.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {sorted.map((l: any) => {
                const oColors: Record<string, { bg: string; text: string }> = {
                  positive: { bg: "#dcfce7", text: "#166534" },
                  neutral: { bg: "#fef3c7", text: "#92400e" },
                  negative: { bg: "#fee2e2", text: "#991b1b" },
                };
                const oc = oColors[l.outcome] ?? oColors.neutral;
                const reliability = Number(l.reliability_score ?? 0);
                const timesSeen = Number(l.times_seen ?? 1);
                const avgCtrLift = Number(l.avg_ctr_lift ?? 0);
                const avgCpcChange = Number(l.avg_cpc_change ?? 0);

                return (
                  <div
                    key={l.id}
                    style={{
                      border: "1px solid #e4e4e7",
                      borderRadius: 10,
                      padding: 12,
                      background: "#fff",
                    }}
                  >
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
                          padding: "1px 8px",
                          borderRadius: 999,
                          fontSize: 11,
                          fontWeight: 600,
                          background: oc.bg,
                          color: oc.text,
                          textTransform: "uppercase",
                        }}
                      >
                        {l.outcome}
                      </span>
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                          fontSize: 11,
                          fontWeight: 600,
                          color: reliability >= 60 ? "#166534" : reliability >= 30 ? "#92400e" : "#991b1b",
                        }}
                      >
                        <span
                          style={{
                            display: "inline-block",
                            width: 40,
                            height: 6,
                            background: "#f4f4f5",
                            borderRadius: 3,
                            overflow: "hidden",
                          }}
                        >
                          <span
                            style={{
                              display: "block",
                              width: `${Math.min(reliability, 100)}%`,
                              height: "100%",
                              background: reliability >= 60 ? "#166534" : reliability >= 30 ? "#d97706" : "#dc2626",
                              borderRadius: 3,
                            }}
                          />
                        </span>
                        {reliability.toFixed(0)}%
                      </span>
                      {timesSeen > 1 && (
                        <span style={{ fontSize: 11, color: "#52525b", fontWeight: 500 }}>
                          seen {timesSeen}x
                        </span>
                      )}
                      {l.tags?.map((tag: string) => (
                        <span
                          key={tag}
                          style={{
                            padding: "1px 6px",
                            borderRadius: 4,
                            fontSize: 10,
                            fontWeight: 500,
                            background: "#f4f4f5",
                            color: "#52525b",
                          }}
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                    <p style={{ margin: "6px 0 0", fontSize: 13, color: "#18181b", lineHeight: 1.5 }}>
                      {l.learning}
                    </p>
                    {(avgCtrLift !== 0 || avgCpcChange !== 0) && (
                      <div style={{ marginTop: 4, display: "flex", gap: 12, fontSize: 11 }}>
                        {avgCtrLift !== 0 && (
                          <span style={{ color: avgCtrLift > 0 ? "#166534" : "#991b1b" }}>
                            Avg CTR lift: {avgCtrLift > 0 ? "+" : ""}{avgCtrLift.toFixed(1)}%
                          </span>
                        )}
                        {avgCpcChange !== 0 && (
                          <span style={{ color: avgCpcChange < 0 ? "#166534" : "#991b1b" }}>
                            Avg CPC change: {avgCpcChange > 0 ? "+" : ""}{avgCpcChange.toFixed(1)}%
                          </span>
                        )}
                      </div>
                    )}
                    {l.created_at && (
                      <p style={{ margin: "4px 0 0", fontSize: 11, color: "#a1a1aa" }}>
                        {new Date(l.created_at).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </SectionCard>
        );
      })()}
          </div>
        }
        experimentsPanel={
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            {/* ── EXPERIMENTS ── */}
      <SectionCard title={`Experiments (${rawExperiments.length})`}>
        <CreateExperimentForm
          clientId={clientId}
          ads={rawAds.map((a: any) => ({ id: a.id, name: a.name }))}
        />
        {rawExperiments.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
            {rawExperiments.map((exp: any) => (
              <div key={exp.id} id={`experiment-${exp.id}`} style={{ scrollMarginTop: 80 }}>
              <ExperimentCard
                experiment={{
                  id: exp.id,
                  title: exp.title,
                  hypothesis: exp.hypothesis,
                  variable_tested: exp.variable_tested,
                  success_metric: exp.success_metric,
                  secondary_metric: exp.secondary_metric,
                  status: exp.status,
                  outcome: exp.outcome,
                  winner: exp.winner,
                  confidence: exp.confidence,
                  started_at: exp.started_at,
                  completed_at: exp.completed_at,
                  variants: (exp.experiment_variants ?? []).map((v: any) => ({
                    id: v.id,
                    ad_id: v.ad_id,
                    label: v.label,
                    role: v.role,
                    notes: v.notes,
                    ad_name: v.ads?.name ?? "Unknown ad",
                    snapshot_before: v.snapshot_before,
                    snapshot_after: v.snapshot_after,
                  })),
                }}
              />
              </div>
            ))}
          </div>
        )}
      </SectionCard>
          </div>
        }
      />
    </div>
  );
}
