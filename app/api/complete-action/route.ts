import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

function getMetricSnapshot(ad: Record<string, unknown>) {
  const impressions = Number(ad.impressions ?? 0);
  const clicks = Number(ad.clicks ?? 0);
  const spend = Number(ad.spend ?? 0);

  return {
    spend,
    impressions,
    clicks,
    ctr: impressions > 0 ? Number(((clicks / impressions) * 100).toFixed(2)) : 0,
    cpc: clicks > 0 ? Number((spend / clicks).toFixed(4)) : 0,
    conversions: Number(ad.conversions ?? 0),
    cost_per_result: Number(ad.cost_per_result ?? 0),
    performance_status: ad.performance_status ?? null,
    performance_score: ad.performance_score ?? null,
    captured_at: new Date().toISOString(),
  };
}

function pctChange(before: number, after: number): number {
  if (before === 0) return after > 0 ? 100 : 0;
  return ((after - before) / before) * 100;
}

function determineOutcome(
  before: Record<string, unknown>,
  after: Record<string, unknown>
): { outcome: string; reasons: string[] } {
  const b = (key: string) => Number(before[key] ?? 0);
  const a = (key: string) => Number(after[key] ?? 0);

  const reasons: string[] = [];
  let positiveSignals = 0;
  let negativeSignals = 0;

  // CTR: >= 20% improvement is positive
  const ctrChange = pctChange(b("ctr"), a("ctr"));
  if (ctrChange >= 20) {
    positiveSignals++;
    reasons.push(`CTR improved ${ctrChange.toFixed(0)}% (${b("ctr")}% → ${a("ctr")}%)`);
  } else if (ctrChange <= -20 && b("ctr") > 0) {
    negativeSignals++;
    reasons.push(`CTR worsened ${Math.abs(ctrChange).toFixed(0)}% (${b("ctr")}% → ${a("ctr")}%)`);
  }

  // CPC: >= 15% reduction is positive (lower is better)
  const cpcChange = pctChange(b("cpc"), a("cpc"));
  if (cpcChange <= -15 && a("cpc") > 0) {
    positiveSignals++;
    reasons.push(`CPC reduced ${Math.abs(cpcChange).toFixed(0)}% ($${b("cpc")} → $${a("cpc")})`);
  } else if (cpcChange >= 15 && b("cpc") > 0) {
    negativeSignals++;
    reasons.push(`CPC increased ${cpcChange.toFixed(0)}% ($${b("cpc")} → $${a("cpc")})`);
  }

  // Conversions: any increase of at least 1 is positive
  const convBefore = b("conversions");
  const convAfter = a("conversions");
  if (convAfter > convBefore && convAfter - convBefore >= 1) {
    positiveSignals++;
    reasons.push(`Conversions increased (${convBefore} → ${convAfter})`);
  } else if (convAfter < convBefore) {
    negativeSignals++;
    reasons.push(`Conversions decreased (${convBefore} → ${convAfter})`);
  } else if (convAfter === 0 && a("spend") > b("spend") + 10) {
    negativeSignals++;
    reasons.push(`No conversions after additional spend ($${b("spend")} → $${a("spend")})`);
  }

  // Score improvement
  const scoreBefore = b("performance_score");
  const scoreAfter = a("performance_score");
  if (scoreAfter > scoreBefore) {
    positiveSignals++;
    reasons.push(`Score improved (${scoreBefore} → ${scoreAfter})`);
  } else if (scoreAfter < scoreBefore) {
    negativeSignals++;
    reasons.push(`Score declined (${scoreBefore} → ${scoreAfter})`);
  }

  let outcome: string;
  if (positiveSignals > negativeSignals) {
    outcome = "positive";
  } else if (negativeSignals > positiveSignals) {
    outcome = "negative";
  } else {
    outcome = "neutral";
  }

  if (reasons.length === 0) {
    reasons.push("No significant metric movement detected");
  }

  return { outcome, reasons };
}

function generateLearning(
  problem: string,
  actionTaken: string,
  outcome: string,
  reasons: string[]
): { learning: string; tags: string[] } {
  const tags: string[] = [];
  const reasonText = reasons.join("; ");

  if (problem.toLowerCase().includes("ctr") || problem.toLowerCase().includes("engagement")) {
    tags.push("creative", "ctr");
  }
  if (problem.toLowerCase().includes("cpc") || problem.toLowerCase().includes("cost")) {
    tags.push("audience", "cpc");
  }
  if (problem.toLowerCase().includes("conversion")) {
    tags.push("landing-page", "offer");
  }
  if (actionTaken.toLowerCase().includes("hook") || actionTaken.toLowerCase().includes("headline")) {
    tags.push("hook");
  }
  if (actionTaken.toLowerCase().includes("audience") || actionTaken.toLowerCase().includes("targeting")) {
    tags.push("targeting");
  }
  if (actionTaken.toLowerCase().includes("budget")) {
    tags.push("budget");
  }

  if (tags.length === 0) tags.push("general");

  let learning: string;
  if (outcome === "positive") {
    learning = `"${actionTaken}" worked for "${problem}". ${reasonText}`;
  } else if (outcome === "negative") {
    learning = `"${actionTaken}" did not work for "${problem}". ${reasonText}`;
  } else {
    learning = `"${actionTaken}" had no clear effect on "${problem}". ${reasonText}`;
  }

  return { learning, tags };
}

export async function POST(req: Request) {
  try {
    const { actionId, resultSummary, manualOutcome } = await req.json();

    if (!actionId) {
      return NextResponse.json(
        { ok: false, error: "actionId is required" },
        { status: 400 }
      );
    }

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

    // Get the action with its problem/action text
    const { data: action, error: actionError } = await supabase
      .from("ad_actions")
      .select("id, ad_id, problem, action, metric_snapshot_before")
      .eq("id", actionId)
      .single();

    if (actionError || !action) {
      return NextResponse.json(
        { ok: false, error: "Action not found" },
        { status: 404 }
      );
    }

    // Get the ad's current metrics for the "after" snapshot
    const { data: ad, error: adError } = await supabase
      .from("ads")
      .select("client_id, spend, impressions, clicks, conversions, cost_per_result, performance_status, performance_score")
      .eq("id", action.ad_id)
      .single();

    if (adError || !ad) {
      return NextResponse.json(
        { ok: false, error: "Ad not found" },
        { status: 404 }
      );
    }

    const afterSnapshot = getMetricSnapshot(ad);

    // Determine outcome with threshold-based classification
    let outcome: string;
    let reasons: string[];

    if (manualOutcome) {
      outcome = manualOutcome;
      reasons = [resultSummary || "Manually classified"];
    } else if (action.metric_snapshot_before) {
      const result = determineOutcome(action.metric_snapshot_before, afterSnapshot);
      outcome = result.outcome;
      reasons = result.reasons;
    } else {
      outcome = "neutral";
      reasons = ["No before-snapshot available for comparison"];
    }

    const now = new Date().toISOString();

    // Update the action
    const { error: updateError } = await supabase
      .from("ad_actions")
      .update({
        status: "completed",
        metric_snapshot_after: afterSnapshot,
        outcome,
        result_summary: resultSummary || reasons.join("; "),
        completed_at: now,
      })
      .eq("id", actionId);

    if (updateError) {
      return NextResponse.json(
        { ok: false, error: `Update failed: ${updateError.message}` },
        { status: 500 }
      );
    }

    // Insert into action_outcomes for history
    const { error: outcomeError } = await supabase
      .from("action_outcomes")
      .insert({
        action_id: actionId,
        metric_snapshot_before: action.metric_snapshot_before ?? null,
        metric_snapshot_after: afterSnapshot,
        outcome,
        result_summary: resultSummary || reasons.join("; "),
      });

    if (outcomeError) {
      console.error("Failed to insert action_outcome:", outcomeError.message);
    }

    // Auto-generate a learning from this outcome
    const { learning, tags } = generateLearning(
      action.problem ?? "",
      action.action ?? "",
      outcome,
      reasons
    );

    const { error: learningError } = await supabase
      .from("action_learnings")
      .insert({
        client_id: ad.client_id,
        ad_id: action.ad_id,
        action_id: actionId,
        problem: action.problem,
        action_taken: action.action,
        outcome,
        metric_before: action.metric_snapshot_before,
        metric_after: afterSnapshot,
        learning,
        tags,
      });

    if (learningError) {
      console.error("Failed to insert learning:", learningError.message);
    }

    return NextResponse.json({
      ok: true,
      outcome,
      reasons,
      learning,
      before: action.metric_snapshot_before,
      after: afterSnapshot,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
