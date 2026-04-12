/**
 * /api/queue-budget-bump — operator-driven, single-ad budget bump.
 *
 * The decision engine seeds budget bumps automatically when it agrees with
 * a "this is a winner" call. This route is the manual escape hatch: an
 * operator clicks Scale on an ad row and we drop one increase_adset_budget
 * row into meta_execution_queue, dedupe-safe and flagged for approval like
 * any other queue entry.
 *
 * We deliberately resolve the ad's adset_meta_id and campaign_id server-side
 * rather than trusting the client — clients can't be trusted to send a Meta
 * id that lines up with the ad row they think they're scaling, and the seed
 * helper has no idea about that mismatch.
 */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { seedIncreaseAdsetBudget } from "@/lib/meta-queue-seed";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { adId } = await req.json();
    if (!adId || typeof adId !== "number") {
      return NextResponse.json(
        { ok: false, error: "adId (number) required" },
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
            "This ad has no ad set Meta id. Run a Meta sync first so we know which ad set to scale.",
        },
        { status: 422 }
      );
    }

    const seeded = await seedIncreaseAdsetBudget(supabase, {
      clientId: ad.client_id != null ? Number(ad.client_id) : null,
      campaignId: ad.campaign_id != null ? Number(ad.campaign_id) : null,
      adId: Number(ad.id),
      adsetMetaId: String(ad.adset_meta_id),
      // Default seeder bump (+15%) — under the executor's hard +20% cap.
      reason: `Operator scaled "${ad.name ?? `ad ${ad.id}`}" from the ad row`,
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
