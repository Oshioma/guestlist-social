/**
 * /api/queue-budget-pullback — operator-driven, single-ad budget pullback.
 *
 * The mirror of /api/queue-budget-bump for losing or fading ads. Drops one
 * decrease_adset_budget row into meta_execution_queue, dedupe-safe and
 * approval-gated. Useful when an operator wants to throttle a struggling
 * ad set without pausing it outright.
 *
 * Like the bump route, we resolve the ad's adset_meta_id and campaign_id
 * server-side rather than trusting the client.
 */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { seedDecreaseAdsetBudget } from "@/lib/meta-queue-seed";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { adId, percentChange } = await req.json();
    if (!adId || typeof adId !== "number") {
      return NextResponse.json(
        { ok: false, error: "adId (number) required" },
        { status: 400 }
      );
    }
    let pullbackPct: number | undefined;
    if (percentChange !== undefined) {
      const n = Number(percentChange);
      if (!Number.isFinite(n) || n <= 0 || n > 50) {
        return NextResponse.json(
          { ok: false, error: "percentChange must be a number in (0, 50]" },
          { status: 400 }
        );
      }
      pullbackPct = n;
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

    const { data: ad, error: adErr } = await supabase
      .from("ads")
      .select("id, name, client_id, campaign_id, adset_meta_id")
      .eq("id", adId)
      .maybeSingle();

    if (adErr || !ad) {
      return NextResponse.json(
        { ok: false, error: adErr?.message ?? "ad not found" },
        { status: 404 }
      );
    }

    if (!ad.adset_meta_id) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "This ad has no ad set Meta id. Run a Meta sync first so we know which ad set to pull back.",
        },
        { status: 422 }
      );
    }

    const seeded = await seedDecreaseAdsetBudget(supabase, {
      clientId: ad.client_id != null ? Number(ad.client_id) : null,
      campaignId: ad.campaign_id != null ? Number(ad.campaign_id) : null,
      adId: Number(ad.id),
      adsetMetaId: String(ad.adset_meta_id),
      percentChange: pullbackPct,
      reason: `Operator pulled back "${ad.name ?? `ad ${ad.id}`}" by −${pullbackPct ?? 25}% from the ad row`,
      riskLevel: "low",
    });

    if (!seeded.ok) {
      return NextResponse.json({ ok: false, error: seeded.error }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      queueId: seeded.queueId,
      deduped: seeded.deduped,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
