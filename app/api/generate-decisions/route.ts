import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  seedPauseAd,
  seedIncreaseAdsetBudget,
} from "@/lib/meta-queue-seed";
import {
  getAppPerformanceStatus,
  getPerformanceScore,
} from "@/app/admin-panel/lib/performance-truth";
import {
  getAutoApproveSettings,
  shouldAutoApprove,
} from "@/lib/app-settings";

export const dynamic = "force-dynamic";

// Inline the decision logic to avoid import issues in API routes
const ENOUGH_SPEND = 10;
const STUCK_TEST_SPEND = 25;
const STRONG_WINNER_SCORE = 5;

// Cross-client pattern thresholds. A pattern only overrides the rule engine
// when at least this many independent clients have validated it AND the
// majority of outcomes were positive. Set conservatively — a wrong pattern
// is worse than no pattern, because the operator trusts pattern-backed
// reasons more than rule-of-thumb reasons.
const PATTERN_MIN_CONSISTENCY = 60;
const PATTERN_MIN_CLIENTS = 2;
const PATTERN_HIGH_CONFIDENCE_CONSISTENCY = 75;
const PATTERN_HIGH_CONFIDENCE_CLIENTS = 3;

// Engine-verdict weighting. pattern_feedback records the engine's own
// track record on each pattern: how often a pattern-backed decision led
// to a positive vs negative measured outcome. We let it override the
// operator-derived consistency_score in two ways:
//
//   1. Block — if the engine has tried a pattern at least
//      ENGINE_VERDICT_MIN_DECISIVE times and >=60% came back negative,
//      treat the pattern as unproven even if operator data says
//      otherwise. The engine's own evidence beats stale operator data.
//
//   2. Boost — if the engine has tried a pattern at least
//      ENGINE_VERDICT_MIN_DECISIVE times and >=70% came back positive,
//      promote the decision to "high" confidence even if operator
//      consistency hasn't crossed the high-confidence threshold yet.
//
// "Decisive" excludes neutral and inconclusive verdicts, which carry
// no signal in either direction.
const ENGINE_VERDICT_MIN_DECISIVE = 3;
const ENGINE_VERDICT_BLOCK_NEG_RATIO = 0.6;
const ENGINE_VERDICT_BOOST_POS_RATIO = 0.7;

type DecisionResult = {
  type: string;
  reason: string;
  action: string;
  confidence: string;
  meta_action: string | null;
  // Set on pattern-backed decisions so the queue row can record which
  // global_learnings pattern (and which industry slice) drove the decision.
  // Both null on rule-engine decisions.
  source_pattern_key?: string | null;
  source_pattern_industry?: string | null;
};

type GlobalPattern = {
  pattern_type: string;
  pattern_key: string;
  pattern_label: string;
  action_summary: string | null;
  consistency_score: number | null;
  unique_clients: number | null;
  times_seen: number | null;
  industry: string | null;
};

type FeedbackRow = {
  positive_verdicts: number;
  negative_verdicts: number;
  neutral_verdicts: number;
  // Retired-by-the-reaper marker. Set by /api/cron/retire-stale-patterns
  // when a pattern's track record has gone decisively negative. The
  // engine treats a retired row as "do not consult" — strictly stronger
  // than the in-memory block verdict, which only vetoes for one request.
  retired: boolean;
};

// Composite key matching pattern_feedback's PK shape: empty string for the
// agency-wide row so we can use a plain Map without coalesce dance.
function feedbackKey(patternKey: string, industry: string | null): string {
  return `${patternKey}|${industry ?? ""}`;
}

// Categorise the engine's feedback for a pattern into block / boost / no-op.
// Returns null when there isn't enough evidence to act on.
type FeedbackVerdict = "block" | "boost" | "neutral";
function classifyFeedback(fb: FeedbackRow | undefined): {
  verdict: FeedbackVerdict;
  positive: number;
  negative: number;
  decisive: number;
} | null {
  if (!fb) return null;
  const positive = fb.positive_verdicts;
  const negative = fb.negative_verdicts;
  const decisive = positive + negative;
  if (decisive < ENGINE_VERDICT_MIN_DECISIVE) {
    return { verdict: "neutral", positive, negative, decisive };
  }
  const negRatio = negative / decisive;
  const posRatio = positive / decisive;
  if (negRatio >= ENGINE_VERDICT_BLOCK_NEG_RATIO) {
    return { verdict: "block", positive, negative, decisive };
  }
  if (posRatio >= ENGINE_VERDICT_BOOST_POS_RATIO) {
    return { verdict: "boost", positive, negative, decisive };
  }
  return { verdict: "neutral", positive, negative, decisive };
}

// Build a key → best-pattern map. When both an industry-scoped row and the
// agency-wide row exist for the same pattern_key, prefer the industry one
// (more specific = more relevant signal for this client).
function buildPatternIndex(
  rows: GlobalPattern[],
  industry: string | null
): Map<string, GlobalPattern> {
  const byKey = new Map<string, GlobalPattern>();
  for (const r of rows) {
    if (r.industry !== null && r.industry !== industry) continue;
    const existing = byKey.get(r.pattern_key);
    if (!existing) {
      byKey.set(r.pattern_key, r);
      continue;
    }
    // Prefer industry-scoped over agency-wide.
    if (existing.industry === null && r.industry === industry) {
      byKey.set(r.pattern_key, r);
    }
  }
  return byKey;
}

function provenPattern(
  byKey: Map<string, GlobalPattern>,
  feedbackByKey: Map<string, FeedbackRow>,
  key: string,
  stats: { blocked: number; retired: number }
): GlobalPattern | null {
  const p = byKey.get(key);
  if (!p) return null;
  if ((p.consistency_score ?? 0) < PATTERN_MIN_CONSISTENCY) return null;
  if ((p.unique_clients ?? 0) < PATTERN_MIN_CLIENTS) return null;
  const fbRow = feedbackByKey.get(feedbackKey(p.pattern_key, p.industry));
  // Hard retirement: the reaper has stamped this pattern as disqualified.
  // Stronger than the in-memory block verdict — survives the rebuild and
  // is the durable signal that we no longer want to reach for it.
  if (fbRow?.retired) {
    stats.retired++;
    return null;
  }
  // Engine veto: if our own track record on this pattern slice is decisively
  // negative, treat it as unproven regardless of operator data. The operator
  // numbers are folded into consistency_score by generate-global-learnings,
  // but only at rebuild time — pattern_feedback is the live signal.
  const fb = classifyFeedback(fbRow);
  if (fb?.verdict === "block") {
    stats.blocked++;
    return null;
  }
  return p;
}

function patternConfidence(
  p: GlobalPattern,
  feedbackByKey: Map<string, FeedbackRow>
): { confidence: "high" | "medium"; boosted: boolean } {
  const operatorHigh =
    (p.consistency_score ?? 0) >= PATTERN_HIGH_CONFIDENCE_CONSISTENCY &&
    (p.unique_clients ?? 0) >= PATTERN_HIGH_CONFIDENCE_CLIENTS;
  const fb = classifyFeedback(
    feedbackByKey.get(feedbackKey(p.pattern_key, p.industry))
  );
  // Engine boost: enough positive verdicts promote the decision to high
  // confidence even if operator data hadn't crossed the bar yet.
  if (fb?.verdict === "boost") {
    return { confidence: "high", boosted: !operatorHigh };
  }
  return { confidence: operatorHigh ? "high" : "medium", boosted: false };
}

function makePatternDecision(
  type: string,
  metaAction: string | null,
  p: GlobalPattern,
  feedbackByKey: Map<string, FeedbackRow>,
  stats: { boosted: number }
): DecisionResult {
  const consistency = Math.round(p.consistency_score ?? 0);
  const clients = p.unique_clients ?? 0;
  const scope =
    p.industry === null
      ? `${clients} client${clients === 1 ? "" : "s"}`
      : `${clients} client${clients === 1 ? "" : "s"} in ${p.industry}`;
  const fb = classifyFeedback(
    feedbackByKey.get(feedbackKey(p.pattern_key, p.industry))
  );
  // When the engine has its own evidence, append it so operators can see
  // both the operator-data baseline AND the engine's track record at a glance.
  const engineNote =
    fb && fb.decisive > 0
      ? `; engine: ${fb.positive}/${fb.decisive} positive verdicts`
      : "";
  const reason = `Pattern (${p.pattern_label}): ${consistency}% positive across ${scope}, ${p.times_seen ?? 0} actions${engineNote}`;
  const { confidence, boosted } = patternConfidence(p, feedbackByKey);
  if (boosted) stats.boosted++;
  return {
    type,
    reason,
    action: p.action_summary || p.pattern_label,
    confidence,
    meta_action: metaAction,
    // Capture provenance so the queue row can record which pattern row
    // (and industry slice) drove this decision. The verdict feedback loop
    // uses this to nudge pattern_feedback when an outcome lands.
    source_pattern_key: p.pattern_key,
    source_pattern_industry: p.industry,
  };
}

// Pattern-backed decision: consult global_learnings before the rule engine.
// Returns null when no proven pattern matches the ad's signature, in which
// case the caller falls through to getDecision().
function getPatternBackedDecision(
  ad: Record<string, unknown>,
  byKey: Map<string, GlobalPattern>,
  feedbackByKey: Map<string, FeedbackRow>,
  stats: { blocked: number; boosted: number; retired: number }
): DecisionResult | null {
  const status = ad.performance_status as string | null;
  const spend = Number(ad.spend ?? 0);
  const score = Number(ad.performance_score ?? 0);
  const ctr = Number(ad.ctr ?? 0);
  const cpc = Number(ad.cpc ?? 0);
  const conversions = Number(ad.conversions ?? 0);

  // Winner → look for a proven scale-up pattern.
  if (status === "winner" && score >= STRONG_WINNER_SCORE && conversions > 0) {
    const p = provenPattern(byKey, feedbackByKey, "budget:scale_up", stats);
    if (p) return makePatternDecision("scale_budget", "update_budget", p, feedbackByKey, stats);
  }

  // Losing → match the failure signature to a proven action pattern.
  // Order matters: most specific signal first.
  if (status === "losing" && spend > ENOUGH_SPEND) {
    // No conversions despite spend → creative replacement is the proven move.
    if (conversions === 0 && spend > 20) {
      for (const key of ["creative:pause_replace", "creative:test_new"]) {
        const p = provenPattern(byKey, feedbackByKey, key, stats);
        if (p) return makePatternDecision("pause_or_replace", "pause", p, feedbackByKey, stats);
      }
    }

    // Low CTR → hook or creative refresh, whichever has the stronger signal.
    if (ctr < 1.0) {
      for (const key of [
        "creative:pause_replace",
        "hook:rewrite",
        "hook:test_new",
        "creative:test_new",
      ]) {
        const p = provenPattern(byKey, feedbackByKey, key, stats);
        if (p) return makePatternDecision("pause_or_replace", "pause", p, feedbackByKey, stats);
      }
    }

    // High CPC → audience refinement is the proven move.
    if (cpc > 3.0) {
      for (const key of ["audience:narrow", "audience:exclude"]) {
        const p = provenPattern(byKey, feedbackByKey, key, stats);
        if (p) return makePatternDecision("pause_or_replace", "pause", p, feedbackByKey, stats);
      }
    }
  }

  return null;
}

function getDecision(
  ad: Record<string, unknown>,
  learnings: Array<{ problem: string; action_taken: string; outcome: string; reliability_score: number; times_seen: number }>,
  playbook: Array<{ category: string; insight: string; avg_reliability: number }>
): DecisionResult | null {
  const status = ad.performance_status as string | null;
  const spend = Number(ad.spend ?? 0);
  const score = Number(ad.performance_score ?? 0);
  const ctr = Number(ad.ctr ?? 0);
  const cpc = Number(ad.cpc ?? 0);
  const conversions = Number(ad.conversions ?? 0);

  if (status === "winner") {
    if (score >= STRONG_WINNER_SCORE && conversions > 0) {
      return {
        type: "scale_budget",
        reason: `Strong winner (score ${score}) with ${conversions} conversions`,
        action: "Increase budget by 20-30%",
        confidence: "high",
        meta_action: "update_budget",
      };
    }
    return {
      type: "scale_budget",
      reason: "Consistent winning performance",
      action: "Increase budget by 20-30%",
      confidence: "medium",
      meta_action: "update_budget",
    };
  }

  if (status === "losing" && spend > ENOUGH_SPEND) {
    const provenFix = learnings.find(
      (l) => l.outcome === "positive" && l.reliability_score > 30 && l.times_seen >= 2
    );

    if (provenFix) {
      return {
        type: "apply_known_fix",
        reason: `Losing ad. Proven fix: "${provenFix.action_taken}" (seen ${provenFix.times_seen}x, ${provenFix.reliability_score.toFixed(0)}% reliable)`,
        action: provenFix.action_taken,
        confidence: provenFix.reliability_score > 60 ? "high" : "medium",
        meta_action: null,
      };
    }

    if (conversions === 0 && spend > 20) {
      return {
        type: "pause_or_replace",
        reason: `No conversions after $${spend.toFixed(2)} spend`,
        action: "Pause ad and create new variation",
        confidence: "high",
        meta_action: "pause",
      };
    }

    if (ctr < 1.0) {
      return {
        type: "pause_or_replace",
        reason: `Low CTR (${ctr}%) after $${spend.toFixed(2)} spend`,
        action: "Pause ad. Test new hook + creative",
        confidence: "high",
        meta_action: "pause",
      };
    }

    if (cpc > 3.0) {
      return {
        type: "pause_or_replace",
        reason: `High CPC ($${cpc.toFixed(2)})`,
        action: "Pause ad. Refine audience or improve relevance",
        confidence: "medium",
        meta_action: "pause",
      };
    }

    return {
      type: "pause_or_replace",
      reason: "Underperforming after sufficient spend",
      action: "Pause ad and create new variation",
      confidence: "medium",
      meta_action: "pause",
    };
  }

  if (status === "testing" && spend > STUCK_TEST_SPEND) {
    return {
      type: "kill_test",
      reason: `$${spend.toFixed(2)} spent with no clear signal`,
      action: "Stop test and reallocate budget",
      confidence: "medium",
      meta_action: "pause",
    };
  }

  if (status === "testing" && playbook.length > 0) {
    const winningPattern = playbook.find(
      (p) => p.category === "winning_hooks" && p.avg_reliability > 40
    );
    if (winningPattern) {
      return {
        type: "apply_winning_pattern",
        reason: `Playbook: ${winningPattern.insight.slice(0, 80)}`,
        action: "Apply proven creative pattern from playbook",
        confidence: winningPattern.avg_reliability > 60 ? "medium" : "low",
        meta_action: null,
      };
    }
  }

  return null;
}

export async function POST(req: Request) {
  try {
    const { clientId, dryRun = false } = await req.json();

    if (!clientId) {
      return NextResponse.json({ ok: false, error: "clientId required" }, { status: 400 });
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      return NextResponse.json({ ok: false, error: "Missing env vars" }, { status: 500 });
    }

    const supabase = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Fetch ads, learnings, playbook, the client's industry, the cross-
    // client global_learnings index, and the engine's own pattern_feedback
    // ledger in parallel. global_learnings is the operator-derived
    // baseline; pattern_feedback is the live record of how the engine's
    // own pattern-backed decisions have actually played out — combined
    // they're the inputs to the confidence-weighted scoring below.
    const [adsRes, learningsRes, playbookRes, clientRes, globalRes, feedbackRes] = await Promise.all([
      supabase
        .from("ads")
        .select("id, name, status, meta_status, meta_id, campaign_id, adset_meta_id, spend, impressions, clicks, conversions, cost_per_result, performance_status, performance_score, ctr, cpc")
        .eq("client_id", clientId),
      supabase
        .from("action_learnings")
        .select("problem, action_taken, outcome, reliability_score, times_seen")
        .eq("client_id", clientId),
      supabase
        .from("client_playbooks")
        .select("category, insight, avg_reliability")
        .eq("client_id", clientId),
      supabase
        .from("clients")
        .select("industry")
        .eq("id", clientId)
        .maybeSingle(),
      supabase
        .from("global_learnings")
        .select(
          "pattern_type, pattern_key, pattern_label, action_summary, consistency_score, unique_clients, times_seen, industry"
        ),
      supabase
        .from("pattern_feedback")
        .select(
          "pattern_key, industry, positive_verdicts, negative_verdicts, neutral_verdicts, retired_at"
        ),
    ]);

    const ads = adsRes.data ?? [];
    const learnings = (learningsRes.data ?? []).map((l) => ({
      problem: l.problem ?? "",
      action_taken: l.action_taken ?? "",
      outcome: l.outcome ?? "neutral",
      reliability_score: Number(l.reliability_score ?? 0),
      times_seen: Number(l.times_seen ?? 1),
    }));
    const playbook = (playbookRes.data ?? []).map((p) => ({
      category: p.category ?? "",
      insight: p.insight ?? "",
      avg_reliability: Number(p.avg_reliability ?? 0),
    }));

    const industry = (clientRes.data?.industry as string | null) ?? null;
    const globalRows = (globalRes.data ?? []).map((r) => ({
      pattern_type: String(r.pattern_type ?? ""),
      pattern_key: String(r.pattern_key ?? ""),
      pattern_label: String(r.pattern_label ?? ""),
      action_summary: r.action_summary as string | null,
      consistency_score: r.consistency_score === null ? null : Number(r.consistency_score),
      unique_clients: r.unique_clients === null ? null : Number(r.unique_clients),
      times_seen: r.times_seen === null ? null : Number(r.times_seen),
      industry: (r.industry as string | null) ?? null,
    }));
    const patternIndex = buildPatternIndex(globalRows, industry);

    // Build the pattern_feedback lookup map. Composite key matches the
    // table's PK shape (empty string for the agency-wide row), so the
    // engine reads the same slice the verdict writer wrote to.
    const feedbackByKey = new Map<string, FeedbackRow>();
    for (const f of feedbackRes.data ?? []) {
      feedbackByKey.set(
        feedbackKey(
          String(f.pattern_key ?? ""),
          (f.industry as string | null) ?? null
        ),
        {
          positive_verdicts: Number(f.positive_verdicts ?? 0),
          negative_verdicts: Number(f.negative_verdicts ?? 0),
          neutral_verdicts: Number(f.neutral_verdicts ?? 0),
          retired: f.retired_at != null,
        }
      );
    }

    const autoApproveSettings = await getAutoApproveSettings(supabase);

    // Compute CTR/CPC for each ad if not stored, and fall back to live-
    // computed performance_status/score when the persisted columns are
    // empty. The Score Ads button populates those columns, but operators
    // shouldn't have to remember to click it before generating decisions —
    // when the column is stale we judge from the current numbers ourselves
    // so the engine matches what the row badges on the ads page show.
    let liveStatusFallbacks = 0;
    const enrichedAds = ads.map((ad) => {
      const impressions = Number(ad.impressions ?? 0);
      const clicks = Number(ad.clicks ?? 0);
      const spend = Number(ad.spend ?? 0);
      const ctr =
        ad.ctr ?? (impressions > 0 ? Number(((clicks / impressions) * 100).toFixed(2)) : 0);
      const cpc =
        ad.cpc ?? (clicks > 0 ? Number((spend / clicks).toFixed(4)) : 0);
      const withRates = { ...ad, ctr, cpc };
      const usedFallback =
        ad.performance_status == null || ad.performance_score == null;
      if (usedFallback) liveStatusFallbacks++;
      return {
        ...withRates,
        performance_status: ad.performance_status ?? getAppPerformanceStatus(withRates),
        performance_score: ad.performance_score ?? getPerformanceScore(withRates),
      };
    });

    // Clear old pending decisions for this client (regenerate fresh).
    // In dry-run mode we leave the existing queue alone — the operator is
    // just previewing, not committing. Same goes for ad_decisions inserts
    // and queue seeding further down.
    if (!dryRun) {
      await supabase
        .from("ad_decisions")
        .delete()
        .eq("client_id", clientId)
        .eq("status", "pending");
    }

    let generated = 0;
    let patternBacked = 0;
    let autoApproved = 0;
    const errors: string[] = [];
    let queuedPause = 0;
    let queuedBudget = 0;
    let queueDeduped = 0;
    // Stats for the engine-verdict weighting layer. `blocked` counts
    // pattern matches that were vetoed by negative engine feedback;
    // `boosted` counts decisions that got upgraded to high confidence
    // because of positive engine feedback alone. Both surface in the
    // response so the operator can see the loop is doing something.
    const feedbackStats = { blocked: 0, boosted: 0, retired: 0 };

    // Per-decision preview rows. Only populated in dry-run mode and only
    // returned in dry-run responses, so the regular path keeps the same
    // payload shape callers already rely on.
    type DecisionPreview = {
      ad_id: number;
      ad_name: string;
      decision: DecisionResult;
      pattern_backed: boolean;
      would_queue_pause: boolean;
      would_queue_budget: boolean;
    };
    const previews: DecisionPreview[] = [];

    for (const ad of enrichedAds) {
      // Pattern lookup first — when a cross-client pattern matches the
      // ad's signature with high enough consistency, prefer it over the
      // single-ad rule branches. Falls through to getDecision() when no
      // proven pattern applies (or when engine feedback has vetoed it).
      const patternDecision = getPatternBackedDecision(
        ad,
        patternIndex,
        feedbackByKey,
        feedbackStats
      );
      const decision = patternDecision ?? getDecision(ad, learnings, playbook);
      if (!decision) continue;
      if (patternDecision) patternBacked++;

      const adMetaId = ad.meta_id ? String(ad.meta_id) : null;
      const adsetMetaId = ad.adset_meta_id ? String(ad.adset_meta_id) : null;
      const isPauseLike =
        decision.type === "pause_or_replace" || decision.type === "kill_test";
      const wouldQueuePause = isPauseLike && !!adMetaId;
      const wouldQueueBudget = decision.type === "scale_budget" && !!adsetMetaId;

      // Dry-run path: capture the preview row, count it as "would generate",
      // and skip every write below. The operator sees exactly what would
      // happen without us touching ad_decisions or meta_execution_queue.
      if (dryRun) {
        previews.push({
          ad_id: Number(ad.id),
          ad_name: String(ad.name ?? `Ad ${ad.id}`),
          decision,
          pattern_backed: patternDecision !== null,
          would_queue_pause: wouldQueuePause,
          would_queue_budget: wouldQueueBudget,
        });
        generated++;
        continue;
      }

      const isAutoApproved = shouldAutoApprove(autoApproveSettings, decision);

      const { error: insertError } = await supabase.from("ad_decisions").insert({
        client_id: clientId,
        ad_id: ad.id,
        type: decision.type,
        reason: decision.reason,
        action: decision.action,
        confidence: decision.confidence,
        meta_action: decision.meta_action,
        status: isAutoApproved ? "approved" : "pending",
        approved_by: isAutoApproved ? "auto:engine" : null,
        approved_at: isAutoApproved ? new Date().toISOString() : null,
      });

      if (insertError) {
        errors.push(`Ad ${ad.id}: ${insertError.message}`);
      } else {
        generated++;
        if (isAutoApproved) autoApproved++;
      }

      // ---------------------------------------------------------------
      // Mirror eligible decisions into meta_execution_queue.
      //
      // Only the safest two decision types get a queue row right now:
      //   - pause_or_replace / kill_test → seedPauseAd
      //   - scale_budget                 → seedIncreaseAdsetBudget
      //
      // The seeders dedupe internally — if there's already a pending or
      // approved row for the same Meta object, we surface it as
      // `deduped` rather than inserting a duplicate.
      //
      // Anything that doesn't have a Meta id is silently skipped: the
      // ad_decisions row still exists for the operator to see, but the
      // queue can't act on it without a real Meta target.
      // ---------------------------------------------------------------
      const localCampaignId =
        ad.campaign_id != null ? Number(ad.campaign_id) : null;
      const localAdId = ad.id != null ? Number(ad.id) : null;

      if (wouldQueuePause) {
        const seeded = await seedPauseAd(supabase, {
          clientId: Number(clientId),
          campaignId: localCampaignId,
          adId: localAdId,
          adMetaId: adMetaId!,
          reason: decision.reason,
          riskLevel: decision.confidence === "high" ? "low" : "medium",
          sourcePatternKey: decision.source_pattern_key ?? null,
          sourcePatternIndustry: decision.source_pattern_industry ?? null,
        });
        if (seeded.ok) {
          if (seeded.deduped) queueDeduped++;
          else {
            queuedPause++;
            if (isAutoApproved && !seeded.deduped) {
              await supabase
                .from("meta_execution_queue")
                .update({
                  status: "approved",
                  approved_by: "auto:engine",
                  approved_at: new Date().toISOString(),
                })
                .eq("id", seeded.queueId)
                .eq("status", "pending");
            }
          }
        } else {
          errors.push(`Queue (pause) ad ${ad.id}: ${seeded.error}`);
        }
      }

      if (wouldQueueBudget) {
        const seeded = await seedIncreaseAdsetBudget(supabase, {
          clientId: Number(clientId),
          campaignId: localCampaignId,
          adId: localAdId,
          adsetMetaId: adsetMetaId!,
          reason: decision.reason,
          riskLevel: decision.confidence === "high" ? "low" : "medium",
          sourcePatternKey: decision.source_pattern_key ?? null,
          sourcePatternIndustry: decision.source_pattern_industry ?? null,
        });
        if (seeded.ok) {
          if (seeded.deduped) queueDeduped++;
          else {
            queuedBudget++;
            if (isAutoApproved && !seeded.deduped) {
              await supabase
                .from("meta_execution_queue")
                .update({
                  status: "approved",
                  approved_by: "auto:engine",
                  approved_at: new Date().toISOString(),
                })
                .eq("id", seeded.queueId)
                .eq("status", "pending");
            }
          }
        } else {
          errors.push(`Queue (budget) ad ${ad.id}: ${seeded.error}`);
        }
      }
    }

    // In dry-run mode the queue counters are zero (we never seeded anything),
    // so report the would-have counts derived from the preview rows instead.
    // Keeps the regular response shape stable for non-dry-run callers.
    const queueSummary = dryRun
      ? {
          would_queue_pause: previews.filter((p) => p.would_queue_pause).length,
          would_queue_budget: previews.filter((p) => p.would_queue_budget).length,
        }
      : {
          pause_ad: queuedPause,
          increase_adset_budget: queuedBudget,
          deduped: queueDeduped,
        };

    return NextResponse.json({
      ok: true,
      dry_run: dryRun,
      generated,
      auto_approved: autoApproved,
      total: ads.length,
      pattern_backed: patternBacked,
      live_status_fallbacks: liveStatusFallbacks,
      industry,
      patterns_loaded: patternIndex.size,
      feedback: {
        // Distinct pattern slices the engine has any verdict ledger for.
        slices_loaded: feedbackByKey.size,
        // Pattern matches the engine vetoed because the ledger said the
        // pattern's been failing in practice.
        blocked_by_feedback: feedbackStats.blocked,
        // Pattern decisions promoted to high confidence by ledger evidence
        // alone (operator data hadn't crossed the high-confidence bar).
        boosted_by_feedback: feedbackStats.boosted,
        // Pattern matches refused outright because the reaper retired the
        // slice. Distinct from blocked_by_feedback: a retired pattern stays
        // disqualified across runs, while a blocked one is recomputed each
        // time and could come back if verdicts swing positive.
        skipped_retired: feedbackStats.retired,
      },
      queue: queueSummary,
      previews: dryRun ? previews : undefined,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
