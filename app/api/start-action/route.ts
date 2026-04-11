import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

function getMetricSnapshot(ad: Record<string, unknown>) {
  return {
    spend: Number(ad.spend ?? 0),
    impressions: Number(ad.impressions ?? 0),
    clicks: Number(ad.clicks ?? 0),
    ctr: Number(ad.ctr ?? 0),
    cpc: Number(ad.cpc ?? 0),
    conversions: Number(ad.conversions ?? 0),
    cost_per_result: Number(ad.cost_per_result ?? 0),
    performance_status: ad.performance_status ?? null,
    performance_score: ad.performance_score ?? null,
    captured_at: new Date().toISOString(),
  };
}

export async function POST(req: Request) {
  try {
    const { actionId, hypothesis } = await req.json();

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

    // Get the action and its linked ad
    const { data: action, error: actionError } = await supabase
      .from("ad_actions")
      .select("id, ad_id, status")
      .eq("id", actionId)
      .single();

    if (actionError || !action) {
      return NextResponse.json(
        { ok: false, error: "Action not found" },
        { status: 404 }
      );
    }

    // Get the ad's current metrics for the "before" snapshot
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

    const snapshot = getMetricSnapshot(ad);

    // Compute ctr and cpc for snapshot
    const impressions = Number(ad.impressions ?? 0);
    const clicks = Number(ad.clicks ?? 0);
    const spend = Number(ad.spend ?? 0);
    snapshot.ctr = impressions > 0 ? Number(((clicks / impressions) * 100).toFixed(2)) : 0;
    snapshot.cpc = clicks > 0 ? Number((spend / clicks).toFixed(4)) : 0;

    // Update the action: set status to in_progress, store before snapshot
    const { error: updateError } = await supabase
      .from("ad_actions")
      .update({
        status: "in_progress",
        hypothesis: hypothesis || null,
        metric_snapshot_before: snapshot,
      })
      .eq("id", actionId);

    if (updateError) {
      return NextResponse.json(
        { ok: false, error: `Update failed: ${updateError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, snapshot });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
