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

function determineOutcome(
  before: Record<string, unknown>,
  after: Record<string, unknown>
): string {
  let improved = 0;
  let worsened = 0;

  const b = (key: string) => Number(before[key] ?? 0);
  const a = (key: string) => Number(after[key] ?? 0);

  // CTR: higher is better
  if (a("ctr") > b("ctr")) improved++;
  else if (a("ctr") < b("ctr")) worsened++;

  // CPC: lower is better
  if (a("cpc") < b("cpc") && a("cpc") > 0) improved++;
  else if (a("cpc") > b("cpc")) worsened++;

  // Conversions: higher is better
  if (a("conversions") > b("conversions")) improved++;
  else if (a("conversions") < b("conversions")) worsened++;

  // Score: higher is better
  if (a("performance_score") > b("performance_score")) improved++;
  else if (a("performance_score") < b("performance_score")) worsened++;

  if (improved > worsened) return "positive";
  if (worsened > improved) return "negative";
  return "neutral";
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

    // Get the action
    const { data: action, error: actionError } = await supabase
      .from("ad_actions")
      .select("id, ad_id, metric_snapshot_before")
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
      .select("spend, impressions, clicks, conversions, cost_per_result, performance_status, performance_score")
      .eq("id", action.ad_id)
      .single();

    if (adError || !ad) {
      return NextResponse.json(
        { ok: false, error: "Ad not found" },
        { status: 404 }
      );
    }

    const afterSnapshot = getMetricSnapshot(ad);

    // Auto-determine outcome if not manually set
    const outcome =
      manualOutcome ||
      (action.metric_snapshot_before
        ? determineOutcome(action.metric_snapshot_before, afterSnapshot)
        : "neutral");

    const now = new Date().toISOString();

    // Update the action
    const { error: updateError } = await supabase
      .from("ad_actions")
      .update({
        status: "completed",
        metric_snapshot_after: afterSnapshot,
        outcome,
        result_summary: resultSummary || null,
        completed_at: now,
      })
      .eq("id", actionId);

    if (updateError) {
      return NextResponse.json(
        { ok: false, error: `Update failed: ${updateError.message}` },
        { status: 500 }
      );
    }

    // Also insert into action_outcomes for full history
    const { error: outcomeError } = await supabase
      .from("action_outcomes")
      .insert({
        action_id: actionId,
        metric_snapshot_before: action.metric_snapshot_before ?? null,
        metric_snapshot_after: afterSnapshot,
        outcome,
        result_summary: resultSummary || null,
      });

    if (outcomeError) {
      console.error("Failed to insert action_outcome:", outcomeError.message);
    }

    return NextResponse.json({
      ok: true,
      outcome,
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
