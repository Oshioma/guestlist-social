import EmptyState from "@/app/admin-panel/components/EmptyState";
import EngineNav from "@/app/admin-panel/components/EngineNav";
import { createClient } from "@/lib/supabase/server";
import DecisionsPageClient, {
  type DecisionCardData,
  type DecisionsPageModel,
  type ResultItem,
} from "./DecisionsPageClient";

export const dynamic = "force-dynamic";

type DecisionRow = {
  id: number;
  ad_id: number | null;
  client_id: number | null;
  type: string | null;
  reason: string | null;
  action: string | null;
  confidence: string | null;
  status: string | null;
  created_at: string | null;
  meta_action: string | null;
  ads:
    | {
        id: number;
        name: string | null;
        campaign_id: number | null;
        creative_image_url: string | null;
        spend: number | null;
        ctr: number | null;
        cpc: number | null;
        conversions: number | null;
      }
    | {
        id: number;
        name: string | null;
        campaign_id: number | null;
        creative_image_url: string | null;
        spend: number | null;
        ctr: number | null;
        cpc: number | null;
        conversions: number | null;
      }[]
    | null;
};

type QueueRow = {
  id: number;
  ad_id: number | null;
  decision_type: string | null;
  status: string | null;
  reason: string | null;
  created_at: string | null;
  executed_at: string | null;
  execution_error: string | null;
};

type OutcomeRow = {
  id: number;
  ad_id: number | null;
  verdict: string | null;
  verdict_reason: string | null;
  decision_type: string | null;
  measured_at: string | null;
  status: string | null;
  baseline_ctr: number | null;
  followup_ctr: number | null;
  baseline_spend_cents: number | null;
  followup_spend_cents: number | null;
  ads:
    | {
        name: string | null;
      }
    | {
        name: string | null;
      }[]
    | null;
};

function relOne<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function timeAgoFromIso(iso: string | null): string {
  if (!iso) return "just now";
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return "just now";
  const diffMs = Date.now() - ts;
  if (diffMs < 60_000) return "just now";
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function mapDecisionType(type: string | null): DecisionCardData["type"] {
  if (type === "pause_or_replace" || type === "pause_ad") return "pause";
  if (
    type === "scale_budget" ||
    type === "increase_adset_budget" ||
    type === "decrease_adset_budget"
  ) {
    return "scale";
  }
  if (type === "apply_known_fix" || type === "apply_winning_pattern") return "test";
  return "hold";
}

function mapConfidence(value: string | null): DecisionCardData["confidence"] {
  if (value === "high" || value === "HIGH") return "HIGH";
  if (value === "medium" || value === "MEDIUM") return "MEDIUM";
  return "LOW";
}

function mapState(status: string | null): DecisionCardData["state"] {
  if (status === "pending") return "needs_review";
  if (status === "approved") return "ready_to_execute";
  if (status === "executed") return "awaiting_outcome";
  return "completed";
}

function actionLabelFromType(type: string | null): string {
  if (type === "pause_or_replace" || type === "pause_ad") return "Paused";
  if (
    type === "scale_budget" ||
    type === "increase_adset_budget" ||
    type === "decrease_adset_budget"
  ) {
    return "Scaled";
  }
  if (type === "apply_known_fix" || type === "apply_winning_pattern") return "Tested";
  return "Reviewed";
}

function outcomeFromVerdict(
  verdict: string | null
): ResultItem["outcome"] {
  if (verdict === "positive") return "positive";
  if (verdict === "negative") return "negative";
  return "neutral";
}

function computeTrustRows(results: ResultItem[]) {
  const byAction = new Map<string, { total: number; positive: number; negative: number }>();
  for (const row of results) {
    const key = row.action;
    const current = byAction.get(key) ?? { total: 0, positive: 0, negative: 0 };
    current.total += 1;
    if (row.outcome === "positive") current.positive += 1;
    if (row.outcome === "negative") current.negative += 1;
    byAction.set(key, current);
  }

  const sorted = Array.from(byAction.entries()).sort((a, b) => {
    const aScore = a[1].total === 0 ? 0 : (a[1].positive - a[1].negative) / a[1].total;
    const bScore = b[1].total === 0 ? 0 : (b[1].positive - b[1].negative) / b[1].total;
    return bScore - aScore;
  });

  const bestAt = sorted[0]?.[0] ?? "Pausing weak ads";
  const strong = sorted[1]?.[0] ?? "Spotting likely winners";
  const needsWork = sorted[sorted.length - 1]?.[0] ?? "Creative test calls";
  return { bestAt, strong, needsWork };
}

export default async function DecisionsPage() {
  try {
    const supabase = await createClient();

    const [clientRes, decisionsRes, queueRes, outcomesRes, autoApproveRes] =
      await Promise.all([
        supabase
          .from("clients")
          .select("name")
          .eq("archived", false)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle<{ name: string | null }>(),
        supabase
          .from("ad_decisions")
          .select(
            "id, ad_id, client_id, type, reason, action, confidence, status, created_at, meta_action, ads(id, name, campaign_id, creative_image_url, spend, ctr, cpc, conversions)"
          )
          .order("created_at", { ascending: false })
          .limit(120),
        supabase
          .from("meta_execution_queue")
          .select(
            "id, ad_id, decision_type, status, reason, created_at, executed_at, execution_error"
          )
          .order("created_at", { ascending: false })
          .limit(180),
        supabase
          .from("decision_outcomes")
          .select(
            "id, ad_id, verdict, verdict_reason, decision_type, measured_at, status, baseline_ctr, followup_ctr, baseline_spend_cents, followup_spend_cents, ads(name)"
          )
          .eq("status", "measured")
          .order("measured_at", { ascending: false })
          .limit(140),
        supabase
          .from("app_settings")
          .select("value")
          .eq("key", "auto_approve")
          .maybeSingle<{ value: Record<string, unknown> }>(),
      ]);

    const queueRows = (queueRes.data ?? []) as QueueRow[];
    const queueByAd = new Map<number, QueueRow>();
    for (const row of queueRows) {
      if (row.ad_id == null) continue;
      if (!queueByAd.has(row.ad_id)) queueByAd.set(row.ad_id, row);
    }

    const decisions = ((decisionsRes.data ?? []) as DecisionRow[]).map((row) => {
      const ad = relOne(row.ads);
      const queue = row.ad_id != null ? queueByAd.get(row.ad_id) : undefined;
      return {
        id: String(row.id),
        adName: ad?.name ?? "Unknown ad",
        campaignName: ad?.campaign_id != null ? `Campaign #${ad.campaign_id}` : "Unknown campaign",
        type: mapDecisionType(row.type ?? null),
        reason: row.reason ?? "No reason provided.",
        insight:
          row.reason ??
          "The engine detected an actionable movement in this ad's recent metrics.",
        ctr: Number(ad?.ctr ?? 0),
        cpc: Number(ad?.cpc ?? 0),
        spend: Number(ad?.spend ?? 0),
        conversions: Number(ad?.conversions ?? 0),
        confidence: mapConfidence(row.confidence ?? null),
        thumbnail: ad?.creative_image_url ?? null,
        impact:
          row.action ??
          "Expected impact will be clearer once this move is reviewed and executed.",
        liveStatus:
          queue?.status ??
          (row.status === "pending"
            ? "Pending review"
            : row.status === "approved"
            ? "Ready to execute"
            : row.status === "executed"
            ? "Awaiting outcome"
            : "Completed"),
        budgetPerDay: null,
        ageLabel: timeAgoFromIso(row.created_at),
        state: mapState(row.status ?? null),
        queueHref: "/app/meta-queue",
        adHref:
          row.client_id != null && row.ad_id != null
            ? `/app/clients/${row.client_id}/ads/${row.ad_id}`
            : null,
      } satisfies DecisionCardData;
    });

    const recentOutcomes = ((outcomesRes.data ?? []) as OutcomeRow[]).slice(0, 7);
    const results: ResultItem[] = recentOutcomes.map((row) => {
      const ad = relOne(row.ads);
      const beforeCtr =
        typeof row.baseline_ctr === "number" ? Number(row.baseline_ctr) : null;
      const afterCtr =
        typeof row.followup_ctr === "number" ? Number(row.followup_ctr) : null;
      const beforeSpend =
        typeof row.baseline_spend_cents === "number"
          ? Number(row.baseline_spend_cents) / 100
          : null;
      const afterSpend =
        typeof row.followup_spend_cents === "number"
          ? Number(row.followup_spend_cents) / 100
          : null;
      return {
        id: String(row.id),
        adName: ad?.name ?? "Unknown ad",
        action: actionLabelFromType(row.decision_type ?? null),
        outcome: outcomeFromVerdict(row.verdict),
        before: {
          ctr: beforeCtr,
          spend: beforeSpend,
        },
        after: {
          ctr: afterCtr,
          spend: afterSpend,
        },
        insight:
          row.verdict_reason ??
          `Outcome measured as ${row.verdict ?? "neutral"} for this action.`,
      };
    });

    const measuredCount = ((outcomesRes.data ?? []) as OutcomeRow[]).length;
    const positiveCount = ((outcomesRes.data ?? []) as OutcomeRow[]).filter(
      (row) => row.verdict === "positive"
    ).length;
    const accuracy =
      measuredCount > 0 ? Math.round((positiveCount / measuredCount) * 100) : 0;

    const executedToday = queueRows.filter((row) => {
      if (row.status !== "executed" || !row.executed_at) return false;
      const dt = new Date(row.executed_at);
      if (Number.isNaN(dt.getTime())) return false;
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      return dt >= start;
    }).length;

    const autoValue = autoApproveRes.data?.value ?? {};
    const autoEnabled = autoValue.enabled === true;
    const autoAllowedTypes = Array.isArray(autoValue.allowedTypes)
      ? (autoValue.allowedTypes as unknown[])
          .filter((t): t is string => typeof t === "string")
          .map((t) => t.replaceAll("_", " "))
          .join(", ")
      : "Pause + budget changes";
    const rejectedRecent = decisions.filter((d) => d.state === "completed").length;
    const trustRows = computeTrustRows(results);

    const latestDecisionCreatedAt =
      ((decisionsRes.data ?? []) as DecisionRow[])[0]?.created_at ?? null;

    const model: DecisionsPageModel = {
      title: clientRes.data?.name ?? "Decision Engine",
      syncedLabel: `Last synced ${timeAgoFromIso(latestDecisionCreatedAt)}`,
      autoMode: {
        enabled: autoEnabled,
        description: autoEnabled
          ? "High confidence only"
          : "Manual review required for all actions",
        allowedActions: autoAllowedTypes || "Pause + budget changes",
        creativePolicy: "Review required",
        last7AutoApproved: queueRows.filter((row) => row.status === "approved").length,
        rejectedRecent,
      },
      trust: {
        accuracy,
        completedCount: measuredCount,
        bestAt: trustRows.bestAt,
        strong: trustRows.strong,
        needsWork: trustRows.needsWork,
      },
      summary: {
        needsReview: decisions.filter((d) => d.state === "needs_review").length,
        executedToday,
        awaitingOutcome: decisions.filter((d) => d.state === "awaiting_outcome").length,
        accuracy,
      },
      decisions,
      results,
    };

    return (
      <div style={{ padding: 20 }}>
        <EngineNav />
        <div style={{ marginTop: 12 }}>
          <DecisionsPageClient model={model} />
        </div>
      </div>
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return (
      <EmptyState
        title="Unable to load decisions"
        description={message}
      />
    );
  }
}
