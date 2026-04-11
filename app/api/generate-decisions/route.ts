import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

// Inline the decision logic to avoid import issues in API routes
const ENOUGH_SPEND = 10;
const STUCK_TEST_SPEND = 25;
const STRONG_WINNER_SCORE = 5;

type DecisionResult = {
  type: string;
  reason: string;
  action: string;
  confidence: string;
  meta_action: string | null;
};

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

    // Fetch ads, learnings, and playbook in parallel
    const [adsRes, learningsRes, playbookRes] = await Promise.all([
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
    const errors: string[] = [];

    for (const ad of enrichedAds) {
      const decision = getDecision(ad, learnings, playbook);
      if (!decision) continue;

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
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
