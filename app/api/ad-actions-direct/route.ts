import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { updateAdStatus, updateCampaignBudget } from "@/lib/meta";
import { createMetaAd } from "@/lib/meta-ad-create";
import { logMetaWrite } from "@/lib/meta-write-log";

export const dynamic = "force-dynamic";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing supabase env vars.");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const action = String(body.action ?? "");

    const supabase = getSupabase();

    // ── Toggle ad status (pause/unpause) ──────────────────────────────
    if (action === "toggle_ad_status") {
      const adId = Number(body.adId);
      const newStatus = body.newStatus as "ACTIVE" | "PAUSED";
      if (!adId || !newStatus) {
        return NextResponse.json({ ok: false, error: "adId and newStatus required" }, { status: 400 });
      }

      const { data: ad } = await supabase
        .from("ads")
        .select("meta_id, client_id")
        .eq("id", adId)
        .single();

      if (!ad?.meta_id) {
        return NextResponse.json({ ok: false, error: "Ad has no Meta ID — can't update status" }, { status: 400 });
      }

      const result = await updateAdStatus(ad.meta_id, newStatus);

      logMetaWrite({
        operation: `direct:${newStatus === "PAUSED" ? "pause_ad" : "unpause_ad"}`,
        adId,
        clientId: ad.client_id,
        metaEndpoint: `/${ad.meta_id}`,
        requestBody: { status: newStatus },
        success: result.success,
        errorMessage: result.error ?? null,
      });

      if (!result.success) {
        return NextResponse.json({ ok: false, error: result.error }, { status: 502 });
      }

      await supabase
        .from("ads")
        .update({ status: newStatus === "PAUSED" ? "paused" : "active" })
        .eq("id", adId);

      return NextResponse.json({ ok: true, status: newStatus });
    }

    // ── Update campaign budget ────────────────────────────────────────
    if (action === "update_budget") {
      const campaignId = Number(body.campaignId);
      const newBudgetPounds = Number(body.newBudgetPounds);
      if (!campaignId || !Number.isFinite(newBudgetPounds) || newBudgetPounds <= 0) {
        return NextResponse.json({ ok: false, error: "campaignId and valid newBudgetPounds required" }, { status: 400 });
      }

      const { data: campaign } = await supabase
        .from("campaigns")
        .select("meta_adset_id, meta_id, client_id")
        .eq("id", campaignId)
        .single();

      if (!campaign?.meta_adset_id) {
        return NextResponse.json({ ok: false, error: "Campaign has no Meta ad set ID" }, { status: 400 });
      }

      const newBudgetCents = Math.round(newBudgetPounds * 100);
      const result = await updateCampaignBudget(campaign.meta_adset_id, newBudgetCents);

      logMetaWrite({
        operation: "direct:update_budget",
        campaignId,
        clientId: campaign.client_id,
        metaEndpoint: `/${campaign.meta_adset_id}`,
        requestBody: { daily_budget: newBudgetCents },
        success: result.success,
        errorMessage: result.error ?? null,
      });

      if (!result.success) {
        return NextResponse.json({ ok: false, error: result.error }, { status: 502 });
      }

      await supabase
        .from("campaigns")
        .update({ budget: newBudgetPounds })
        .eq("id", campaignId);

      return NextResponse.json({ ok: true, budget: newBudgetPounds });
    }

    // ── Duplicate ad ──────────────────────────────────────────────────
    if (action === "duplicate_ad") {
      const adId = Number(body.adId);
      const newName = String(body.newName ?? "");
      if (!adId) {
        return NextResponse.json({ ok: false, error: "adId required" }, { status: 400 });
      }

      const { data: ad } = await supabase
        .from("ads")
        .select("meta_id, client_id, campaign_id, name, adset_meta_id, creative_image_url, creative_headline, creative_body, creative_cta")
        .eq("id", adId)
        .single();

      if (!ad) {
        return NextResponse.json({ ok: false, error: "Ad not found" }, { status: 404 });
      }

      if (!ad.adset_meta_id) {
        return NextResponse.json({ ok: false, error: "Ad has no ad set Meta ID — can't duplicate" }, { status: 400 });
      }

      if (!ad.creative_image_url) {
        return NextResponse.json({ ok: false, error: "Ad has no creative image — can't duplicate" }, { status: 400 });
      }

      const dupName = newName || `${ad.name} — copy`;
      const result = await createMetaAd({
        adsetMetaId: ad.adset_meta_id,
        name: dupName,
        imageUrl: ad.creative_image_url,
        headline: ad.creative_headline ?? "",
        body: ad.creative_body ?? "",
        ctaType: ad.creative_cta ?? "learn_more",
        destinationUrl: "",
      });

      if (!result.ok) {
        return NextResponse.json({ ok: false, error: `Meta ${result.step}: ${result.error}` }, { status: 502 });
      }

      const { data: newAd } = await supabase
        .from("ads")
        .insert({
          client_id: ad.client_id,
          campaign_id: ad.campaign_id,
          meta_id: result.adId,
          name: dupName,
          status: "testing",
          creative_image_url: ad.creative_image_url,
          creative_headline: ad.creative_headline,
          creative_body: ad.creative_body,
          creative_cta: ad.creative_cta,
        })
        .select("id")
        .single();

      return NextResponse.json({ ok: true, newAdId: newAd?.id, metaAdId: result.adId });
    }

    return NextResponse.json({ ok: false, error: `Unknown action: ${action}` }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
