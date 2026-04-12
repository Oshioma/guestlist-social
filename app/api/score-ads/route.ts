import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const MIN_SPEND_TO_JUDGE = 10;
const MIN_IMPRESSIONS_TO_JUDGE = 1000;
const GOOD_CTR = 2.0;
const BAD_CTR = 1.0;
const GOOD_CPC = 1.5;
const BAD_CPC = 3.0;
const MAX_COST_PER_RESULT = 8;

function getPerformanceScore(ad: {
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  conversions: number;
  cost_per_result: number;
}): number {
  let score = 0;

  if (ad.ctr >= GOOD_CTR) score += 2;
  if (ad.ctr > 0 && ad.ctr < BAD_CTR) score -= 2;

  if (ad.conversions >= 1) score += 3;
  if (ad.spend >= MIN_SPEND_TO_JUDGE && ad.conversions === 0) score -= 2;

  if (ad.cpc > 0 && ad.cpc <= GOOD_CPC) score += 2;
  if (ad.cpc >= BAD_CPC) score -= 2;

  if (ad.cost_per_result > 0 && ad.cost_per_result <= MAX_COST_PER_RESULT) score += 2;
  if (ad.cost_per_result > MAX_COST_PER_RESULT) score -= 2;

  if (ad.impressions >= MIN_IMPRESSIONS_TO_JUDGE) score += 1;

  return score;
}

function getStatus(ad: {
  status?: string | null;
  meta_status?: string | null;
  spend: number;
  impressions: number;
  ctr: number;
  cpc: number;
  conversions: number;
  cost_per_result: number;
}): string {
  const metaStatus = String(ad.meta_status ?? ad.status ?? "").toLowerCase();
  if (metaStatus.includes("paused")) return "paused";

  const hasEnoughData =
    ad.spend >= MIN_SPEND_TO_JUDGE || ad.impressions >= MIN_IMPRESSIONS_TO_JUDGE;
  if (!hasEnoughData) return "testing";

  const score = getPerformanceScore(ad as any);
  if (score >= 3) return "winner";
  if (score <= -2) return "losing";
  return "testing";
}

function getReason(ad: {
  status?: string | null;
  meta_status?: string | null;
  spend: number;
  impressions: number;
  ctr: number;
  cpc: number;
  conversions: number;
  cost_per_result: number;
}): string {
  const s = getStatus(ad);
  if (s === "paused") return "Paused in Meta.";
  if (s === "testing") {
    if (ad.spend < MIN_SPEND_TO_JUDGE) return "Still gathering enough spend to judge.";
    return "Mixed signals. Keep testing.";
  }
  if (s === "winner") {
    if (ad.conversions > 0) return "Strong enough performance with conversions.";
    if (ad.ctr >= GOOD_CTR && ad.cpc <= GOOD_CPC) return "Strong CTR with efficient clicks.";
    return "Performance is clearly above threshold.";
  }
  if (ad.conversions === 0 && ad.spend >= MIN_SPEND_TO_JUDGE) {
    return "Spent enough to judge, but no conversions yet.";
  }
  if (ad.ctr < BAD_CTR) return "Low CTR after meaningful delivery.";
  if (ad.cpc >= BAD_CPC) return "Clicks are too expensive.";
  return "Performance is below threshold.";
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const clientId = body.clientId; // optional: score only one client's ads

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        { ok: false, error: "Missing Supabase env vars" },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    let query = supabase
      .from("ads")
      .select("id, status, meta_status, spend, impressions, clicks, conversions, cost_per_result");

    if (clientId) {
      query = query.eq("client_id", clientId);
    }

    const { data: ads, error: fetchError } = await query;

    if (fetchError) {
      return NextResponse.json(
        { ok: false, error: `Failed to fetch ads: ${fetchError.message}` },
        { status: 500 }
      );
    }

    if (!ads || ads.length === 0) {
      return NextResponse.json({ ok: true, scored: 0 });
    }

    let scored = 0;
    const breakdown = { winner: 0, losing: 0, testing: 0, paused: 0 };
    const errors: string[] = [];

    // Accumulators for impact estimates
    const winnerCtrs: number[] = [];
    const loserCtrs: number[] = [];
    let winnerTotalConversions = 0;
    let winnerTotalSpend = 0;
    let loserTotalSpend = 0;
    let stuckTestSpend = 0;
    let stuckTestCount = 0;

    for (const row of ads) {
      const impressions = Number(row.impressions ?? 0);
      const clicks = Number(row.clicks ?? 0);
      const spend = Number(row.spend ?? 0);
      const conversions = Number(row.conversions ?? 0);
      const costPerResult = Number(row.cost_per_result ?? 0);
      const ctr = impressions > 0 ? Number(((clicks / impressions) * 100).toFixed(2)) : 0;
      const cpc = clicks > 0 ? Number((spend / clicks).toFixed(4)) : 0;

      const ad = {
        status: row.status,
        meta_status: row.meta_status,
        spend,
        impressions,
        clicks,
        ctr,
        cpc,
        conversions,
        cost_per_result: costPerResult,
      };

      const perfStatus = getStatus(ad);
      const perfScore = getPerformanceScore(ad);
      const perfReason = getReason(ad);

      const { error: updateError } = await supabase
        .from("ads")
        .update({
          performance_status: perfStatus,
          performance_score: perfScore,
          performance_reason: perfReason,
          last_scored_at: new Date().toISOString(),
        })
        .eq("id", row.id);

      if (updateError) {
        errors.push(`Ad ${row.id}: ${updateError.message}`);
      } else {
        scored++;
        if (perfStatus === "winner") {
          breakdown.winner++;
          if (ctr > 0) winnerCtrs.push(ctr);
          winnerTotalConversions += conversions;
          winnerTotalSpend += spend;
        } else if (perfStatus === "losing") {
          breakdown.losing++;
          if (ctr > 0) loserCtrs.push(ctr);
          loserTotalSpend += spend;
        } else if (perfStatus === "paused") {
          breakdown.paused++;
        } else {
          breakdown.testing++;
          // Stuck tests = testing ads with meaningful spend but no signal
          if (spend > 25) {
            stuckTestSpend += spend;
            stuckTestCount++;
          }
        }
      }
    }

    // Compute impact estimates
    const avgWinnerCtr = winnerCtrs.length > 0
      ? winnerCtrs.reduce((s, v) => s + v, 0) / winnerCtrs.length
      : 0;
    const avgLoserCtr = loserCtrs.length > 0
      ? loserCtrs.reduce((s, v) => s + v, 0) / loserCtrs.length
      : 0;

    const impact: {
      fixLosingCtrLift?: string;
      scaleWinnersConversions?: string;
      reallocateWaste?: string;
    } = {};

    // "Fixing N losing ads could improve CTR by ~X-Y%"
    if (breakdown.losing > 0 && avgLoserCtr > 0 && avgWinnerCtr > avgLoserCtr) {
      const liftPct = ((avgWinnerCtr - avgLoserCtr) / avgLoserCtr) * 100;
      const lo = Math.round(liftPct * 0.5);
      const hi = Math.round(liftPct);
      if (lo > 5) {
        impact.fixLosingCtrLift =
          `Fixing ${breakdown.losing} losing ad${breakdown.losing > 1 ? "s" : ""} could improve CTR by ~${lo}–${hi}%`;
      }
    }

    // "Scaling N winners could drive +X more conversions"
    if (breakdown.winner > 0 && winnerTotalConversions > 0) {
      const estExtra = Math.max(1, Math.round(winnerTotalConversions * 0.25));
      impact.scaleWinnersConversions =
        `Scaling ${breakdown.winner} winner${breakdown.winner > 1 ? "s" : ""} could drive +${estExtra} more conversion${estExtra > 1 ? "s" : ""}`;
    } else if (breakdown.winner > 0 && winnerTotalSpend > 0) {
      const budgetGain = winnerTotalSpend * 0.25;
      impact.scaleWinnersConversions =
        `Scaling ${breakdown.winner} winner${breakdown.winner > 1 ? "s" : ""} adds ~$${budgetGain.toFixed(0)} to your best-performing ads`;
    }

    // "Reallocate $X from N stuck tests to winning ads"
    const wastedSpend = loserTotalSpend + stuckTestSpend;
    if (wastedSpend > 5) {
      const sources: string[] = [];
      if (breakdown.losing > 0) sources.push(`${breakdown.losing} losing ad${breakdown.losing > 1 ? "s" : ""}`);
      if (stuckTestCount > 0) sources.push(`${stuckTestCount} stuck test${stuckTestCount > 1 ? "s" : ""}`);
      impact.reallocateWaste =
        `$${wastedSpend.toFixed(0)} spent on ${sources.join(" and ")} could be reallocated to winners`;
    }

    return NextResponse.json({
      ok: true,
      scored,
      total: ads.length,
      breakdown,
      impact,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
