import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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

type DecisionResult = {
  type: string;
  reason: string;
  action: string;
  confidence: string;
  meta_action: string | null;
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
  key: string
): GlobalPattern | null {
  const p = byKey.get(key);
  if (!p) return null;
  if ((p.consistency_score ?? 0) < PATTERN_MIN_CONSISTENCY) return null;
  if ((p.unique_clients ?? 0) < PATTERN_MIN_CLIENTS) return null;
  return p;
}

function patternConfidence(p: GlobalPattern): "high" | "medium" {
  return (p.consistency_score ?? 0) >= PATTERN_HIGH_CONFIDENCE_CONSISTENCY &&
    (p.unique_clients ?? 0) >= PATTERN_HIGH_CONFIDENCE_CLIENTS
    ? "high"
    : "medium";
}

function makePatternDecision(
  type: string,
  metaAction: string | null,
  p: GlobalPattern
): DecisionResult {
  const consistency = Math.round(p.consistency_score ?? 0);
  const clients = p.unique_clients ?? 0;
  const scope =
    p.industry === null
      ? `${clients} client${clients === 1 ? "" : "s"}`
      : `${clients} client${clients === 1 ? "" : "s"} in ${p.industry}`;
  const reason = `Pattern (${p.pattern_label}): ${consistency}% positive across ${scope}, ${p.times_seen ?? 0} actions`;
  return {
    type,
    reason,
    action: p.action_summary || p.pattern_label,
    confidence: patternConfidence(p),
    meta_action: metaAction,
  };
}

// Pattern-backed decision: consult global_learnings before the rule engine.
// Returns null when no proven pattern matches the ad's signature, in which
// case the caller falls through to getDecision().
function getPatternBackedDecision(
  ad: Record<string, unknown>,
  byKey: Map<string, GlobalPattern>
): DecisionResult | null {
  const status = ad.performance_status as string | null;
  const spend = Number(ad.spend ?? 0);
  const score = Number(ad.performance_score ?? 0);
  const ctr = Number(ad.ctr ?? 0);
  const cpc = Number(ad.cpc ?? 0);
  const conversions = Number(ad.conversions ?? 0);

  // Winner → look for a proven scale-up pattern.
  if (status === "winner" && score >= STRONG_WINNER_SCORE && conversions > 0) {
    const p = provenPattern(byKey, "budget:scale_up");
    if (p) return makePatternDecision("scale_budget", "update_budget", p);
  }

  // Losing → match the failure signature to a proven action pattern.
  // Order matters: most specific signal first.
  if (status === "losing" && spend > ENOUGH_SPEND) {
    // No conversions despite spend → creative replacement is the proven move.
    if (conversions === 0 && spend > 20) {
      for (const key of ["creative:pause_replace", "creative:test_new"]) {
        const p = provenPattern(byKey, key);
        if (p) return makePatternDecision("pause_or_replace", "pause", p);
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
        const p = provenPattern(byKey, key);
        if (p) return makePatternDecision("pause_or_replace", "pause", p);
      }
    }

    // High CPC → audience refinement is the proven move.
    if (cpc > 3.0) {
      for (const key of ["audience:narrow", "audience:exclude"]) {
        const p = provenPattern(byKey, key);
        if (p) return makePatternDecision("pause_or_replace", "pause", p);
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
    const { clientId } = await req.json();

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

    // Fetch ads, learnings, playbook, the client's industry, and the
    // cross-client global_learnings index in parallel. The global learnings
    // table is the missing intelligence layer the engine used to ignore —
    // pulling it here lets getPatternBackedDecision() prefer patterns
    // validated across multiple clients over per-ad rules of thumb.
    const [adsRes, learningsRes, playbookRes, clientRes, globalRes] = await Promise.all([
      supabase
        .from("ads")
        .select("id, name, status, meta_status, spend, impressions, clicks, conversions, cost_per_result, performance_status, performance_score, ctr, cpc")
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

    // Compute CTR/CPC for each ad if not stored
    const enrichedAds = ads.map((ad) => {
      const impressions = Number(ad.impressions ?? 0);
      const clicks = Number(ad.clicks ?? 0);
      const spend = Number(ad.spend ?? 0);
      return {
        ...ad,
        ctr: ad.ctr ?? (impressions > 0 ? Number(((clicks / impressions) * 100).toFixed(2)) : 0),
        cpc: ad.cpc ?? (clicks > 0 ? Number((spend / clicks).toFixed(4)) : 0),
      };
    });

    // Clear old pending decisions for this client (regenerate fresh)
    await supabase
      .from("ad_decisions")
      .delete()
      .eq("client_id", clientId)
      .eq("status", "pending");

    let generated = 0;
    let patternBacked = 0;
    const errors: string[] = [];

    for (const ad of enrichedAds) {
      // Pattern lookup first — when a cross-client pattern matches the
      // ad's signature with high enough consistency, prefer it over the
      // single-ad rule branches. Falls through to getDecision() when no
      // proven pattern applies.
      const patternDecision = getPatternBackedDecision(ad, patternIndex);
      const decision = patternDecision ?? getDecision(ad, learnings, playbook);
      if (!decision) continue;
      if (patternDecision) patternBacked++;

      const { error: insertError } = await supabase.from("ad_decisions").insert({
        client_id: clientId,
        ad_id: ad.id,
        type: decision.type,
        reason: decision.reason,
        action: decision.action,
        confidence: decision.confidence,
        meta_action: decision.meta_action,
        status: "pending",
      });

      if (insertError) {
        errors.push(`Ad ${ad.id}: ${insertError.message}`);
      } else {
        generated++;
      }
    }

    return NextResponse.json({
      ok: true,
      generated,
      total: ads.length,
      pattern_backed: patternBacked,
      industry,
      patterns_loaded: patternIndex.size,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
