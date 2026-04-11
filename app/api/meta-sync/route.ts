import { createClient } from "@/lib/supabase/server";
import {
  getCampaigns,
  getAdInsights,
  getAds,
  mapMetaStatus,
  mapMetaObjective,
  insightToAdRow,
} from "@/lib/meta";

/**
 * GET /api/meta-sync
 *
 * Pulls campaigns + ad insights from Meta and upserts them into
 * Supabase. Call this on a schedule or manually to keep data fresh.
 *
 * Query params:
 *   clientId  — required, the Supabase client ID to associate data with
 *   range     — optional, Meta date preset (default: "last_7d")
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get("clientId");
  const range = searchParams.get("range") ?? "last_7d";

  if (!clientId) {
    return Response.json({ error: "clientId query param is required" }, { status: 400 });
  }

  try {
    const supabase = await createClient();

    // 1. Sync campaigns
    const metaCampaigns = await getCampaigns();
    const campaignMap = new Map<string, string>(); // meta campaign id → supabase campaign id

    for (const mc of metaCampaigns) {
      // Check if we already have this campaign (by meta_id)
      const { data: existing } = await supabase
        .from("campaigns")
        .select("id")
        .eq("client_id", clientId)
        .eq("meta_id", mc.id)
        .limit(1);

      if (existing && existing.length > 0) {
        campaignMap.set(mc.id, String(existing[0].id));

        // Update existing campaign
        await supabase
          .from("campaigns")
          .update({
            name: mc.name,
            status: mapMetaStatus(mc.status),
            objective: mapMetaObjective(mc.objective),
            budget: Number(mc.daily_budget ?? mc.lifetime_budget ?? 0) / 100,
          })
          .eq("id", existing[0].id);
      } else {
        // Insert new campaign
        const { data: newCampaign } = await supabase
          .from("campaigns")
          .insert({
            client_id: clientId,
            meta_id: mc.id,
            name: mc.name,
            status: mapMetaStatus(mc.status),
            objective: mapMetaObjective(mc.objective),
            budget: Number(mc.daily_budget ?? mc.lifetime_budget ?? 0) / 100,
          })
          .select("id")
          .single();

        if (newCampaign) {
          campaignMap.set(mc.id, String(newCampaign.id));
        }
      }
    }

    // 2. Sync ads + insights
    const [metaAds, insights] = await Promise.all([
      getAds(),
      getAdInsights(range),
    ]);

    // Build insight lookup by ad ID
    const insightByAdId = new Map(
      insights.map((i) => [i.ad_id, i])
    );

    let adsCreated = 0;
    let adsUpdated = 0;

    for (const metaAd of metaAds) {
      const campaignId = campaignMap.get(metaAd.campaign_id);
      if (!campaignId) continue; // campaign not in our system

      const insight = insightByAdId.get(metaAd.id);
      const adData = insight
        ? insightToAdRow(insight)
        : {
            name: metaAd.name,
            spend: 0,
            impressions: 0,
            clicks: 0,
            cost_per_result: 0,
            conversions: 0,
            engagement: 0,
            followers_gained: 0,
          };

      // Check if we already have this ad (by meta_id)
      const { data: existingAd } = await supabase
        .from("ads")
        .select("id")
        .eq("client_id", clientId)
        .eq("meta_id", metaAd.id)
        .limit(1);

      if (existingAd && existingAd.length > 0) {
        await supabase
          .from("ads")
          .update({
            name: adData.name,
            status: mapMetaStatus(metaAd.status),
            spend: adData.spend,
            impressions: adData.impressions,
            clicks: adData.clicks,
            cost_per_result: adData.cost_per_result,
            conversions: adData.conversions,
          })
          .eq("id", existingAd[0].id);
        adsUpdated++;
      } else {
        await supabase.from("ads").insert({
          client_id: clientId,
          campaign_id: campaignId,
          meta_id: metaAd.id,
          status: mapMetaStatus(metaAd.status),
          ...adData,
        });
        adsCreated++;
      }
    }

    return Response.json({
      ok: true,
      campaigns: metaCampaigns.length,
      ads: { created: adsCreated, updated: adsUpdated },
    });
  } catch (err) {
    console.error("Meta sync error:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Sync failed" },
      { status: 500 }
    );
  }
}
