/**
 * /api/queue-all-winners — bulk version of queue-budget-bump.
 *
 * Operator clicks "Queue them up" on the Estimated Impact panel and we
 * fan out one increase_adset_budget row per winning ad in the client.
 * Same dedupe-safe seeder as the per-ad path; same +15% default; still
 * waits for approval in the action queue before anything reaches Meta.
 *
 * "Winner" means whichever scoring is freshest:
 *   - persisted ads.performance_status === "winner" if Score Ads has run
 *   - otherwise we fall back to live computation, matching the badges on
 *     the ad row and the decision engine
 *
 * Ads without an adset_meta_id are silently skipped (counted as `skipped`)
 * — they need a Meta sync first before we know which ad set to scale.
 */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { seedIncreaseAdsetBudget } from "@/lib/meta-queue-seed";
import { getAppPerformanceStatus } from "@/app/admin-panel/lib/performance-truth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { clientId } = await req.json();
    if (!clientId) {
      return NextResponse.json(
        { ok: false, error: "clientId required" },
        { status: 400 }
      );
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      return NextResponse.json(
        { ok: false, error: "Missing env vars" },
        { status: 500 }
      );
    }

    const supabase = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: ads, error: adsErr } = await supabase
      .from("ads")
      .select(
        "id, name, client_id, campaign_id, adset_meta_id, status, meta_status, spend, impressions, clicks, conversions, cost_per_result, performance_status, performance_score, ctr, cpc"
      )
      .eq("client_id", clientId);

    if (adsErr) {
      return NextResponse.json(
        { ok: false, error: adsErr.message },
        { status: 500 }
      );
    }

    let queued = 0;
    let deduped = 0;
    let skippedNoMetaId = 0;
    const errors: string[] = [];

    for (const ad of ads ?? []) {
      const impressions = Number(ad.impressions ?? 0);
      const clicks = Number(ad.clicks ?? 0);
      const spend = Number(ad.spend ?? 0);
      const ctr =
        ad.ctr ?? (impressions > 0 ? Number(((clicks / impressions) * 100).toFixed(2)) : 0);
      const cpc = ad.cpc ?? (clicks > 0 ? Number((spend / clicks).toFixed(4)) : 0);
      const status =
        ad.performance_status ?? getAppPerformanceStatus({ ...ad, ctr, cpc });
      if (status !== "winner") continue;

      if (!ad.adset_meta_id) {
        skippedNoMetaId++;
        continue;
      }

      const seeded = await seedIncreaseAdsetBudget(supabase, {
        clientId: ad.client_id != null ? Number(ad.client_id) : null,
        campaignId: ad.campaign_id != null ? Number(ad.campaign_id) : null,
        adId: Number(ad.id),
        adsetMetaId: String(ad.adset_meta_id),
        reason: `Bulk scale: "${ad.name ?? `ad ${ad.id}`}" flagged as a winner`,
        riskLevel: "low",
      });

      if (!seeded.ok) {
        errors.push(`Ad ${ad.id}: ${seeded.error}`);
        continue;
      }
      if (seeded.deduped) deduped++;
      else queued++;
    }

    return NextResponse.json({
      ok: true,
      queued,
      deduped,
      skippedNoMetaId,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
