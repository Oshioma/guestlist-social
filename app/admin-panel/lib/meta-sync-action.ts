"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  getCampaigns,
  getAds,
  getAdSets,
  getAdInsights,
  getDailyAdInsights,
  mapMetaStatus,
  mapMetaObjective,
  insightToAdRow,
  targetingToAudience,
} from "@/lib/meta";
import { getAdAccount } from "@/lib/meta";

/**
 * Import from Meta: creates a client from the ad account name,
 * then syncs all campaigns, ads, and insights into it.
 */
export async function importFromMeta() {
  const supabase = await createClient();

  try {
    const account = await getAdAccount();
    const accountName = account.name ?? "Meta Ad Account";

    // Check if client already exists with this name
    const { data: existing } = await supabase
      .from("clients")
      .select("id, name")
      .eq("name", accountName)
      .limit(1);

    let clientId: string;

    if (existing && existing.length > 0) {
      clientId = String(existing[0].id);
    } else {
      const { data: newClient, error } = await supabase
        .from("clients")
        .insert({
          name: accountName,
          platform: "Meta",
          status: "growing",
          archived: false,
        })
        .select("id")
        .single();

      if (error || !newClient) {
        return { ok: false, error: `Could not create client: ${error?.message}` };
      }

      clientId = String(newClient.id);
    }

    // Now run the full sync into this client
    const result = await syncMetaData(clientId);

    if (result.ok) {
      result.log?.unshift(`Client "${accountName}" ready (id: ${clientId})`);
    }

    revalidatePath("/app/settings");
    revalidatePath("/app/clients");

    return result;
  } catch (err) {
    console.error("importFromMeta error:", err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Import failed",
    };
  }
}

export async function syncMetaData(clientId: string) {
  const supabase = await createClient();

  // Verify client exists
  const { data: client, error: clientError } = await supabase
    .from("clients")
    .select("id, name")
    .eq("id", clientId)
    .single();

  if (clientError || !client) {
    return { ok: false, error: `Client ${clientId} not found` };
  }

  const log: string[] = [];

  try {
    log.push(`Syncing Meta data for "${client.name}"`);

    // 1. Campaigns
    const metaCampaigns = await getCampaigns();
    log.push(`Fetched ${metaCampaigns.length} campaigns from Meta`);

    const campaignMap = new Map<string, string>();
    let campaignsCreated = 0;
    let campaignsUpdated = 0;

    for (const mc of metaCampaigns) {
      const budget = Number(mc.daily_budget ?? mc.lifetime_budget ?? 0) / 100;
      const campaignData = {
        name: mc.name,
        status: mapMetaStatus(mc.status),
        objective: mapMetaObjective(mc.objective),
        budget,
      };

      const { data: existing } = await supabase
        .from("campaigns")
        .select("id")
        .eq("client_id", clientId)
        .eq("meta_id", mc.id)
        .limit(1);

      if (existing && existing.length > 0) {
        campaignMap.set(mc.id, String(existing[0].id));
        await supabase
          .from("campaigns")
          .update(campaignData)
          .eq("id", existing[0].id);
        campaignsUpdated++;
      } else {
        const { data: newCampaign } = await supabase
          .from("campaigns")
          .insert({ client_id: clientId, meta_id: mc.id, ...campaignData })
          .select("id")
          .single();

        if (newCampaign) {
          campaignMap.set(mc.id, String(newCampaign.id));
          campaignsCreated++;
        }
      }
    }

    log.push(`Campaigns: ${campaignsCreated} created, ${campaignsUpdated} updated`);

    // 2. Ad Sets → audience data
    const metaAdSets = await getAdSets();
    const adSetAudienceMap = new Map<string, string>();
    for (const adSet of metaAdSets) {
      adSetAudienceMap.set(adSet.id, targetingToAudience(adSet));
    }
    log.push(`Fetched ${metaAdSets.length} ad sets`);

    // 3. Ads + Insights (last 12 months)
    const [metaAds, insights] = await Promise.all([
      getAds(),
      getAdInsights({ datePreset: "last_year" }),
    ]);

    const insightByAdId = new Map(insights.map((i) => [i.ad_id, i]));

    let adsCreated = 0;
    let adsUpdated = 0;

    for (const metaAd of metaAds) {
      const supabaseCampaignId = campaignMap.get(metaAd.campaign_id);
      if (!supabaseCampaignId) continue;

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

      const audience = adSetAudienceMap.get(metaAd.adset_id) ?? null;
      const creativeHook = metaAd.creative
        ? [metaAd.creative.title, metaAd.creative.body]
            .filter(Boolean)
            .join(" — ") || null
        : null;

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
            engagement: adData.engagement,
            audience,
            creative_hook: creativeHook,
          })
          .eq("id", existingAd[0].id);
        adsUpdated++;
      } else {
        await supabase.from("ads").insert({
          client_id: clientId,
          campaign_id: supabaseCampaignId,
          meta_id: metaAd.id,
          status: mapMetaStatus(metaAd.status),
          audience,
          creative_hook: creativeHook,
          ...adData,
        });
        adsCreated++;
      }
    }

    log.push(`Ads: ${adsCreated} created, ${adsUpdated} updated`);

    // 4. Daily snapshots (last 30 days)
    let snapshotsCreated = 0;
    try {
      const dailyInsights = await getDailyAdInsights({ datePreset: "last_30d" });

      const { data: allAds } = await supabase
        .from("ads")
        .select("id, meta_id, campaign_id")
        .eq("client_id", clientId);

      const metaToSupabaseAd = new Map<string, { id: string; campaignId: string }>();
      for (const ad of allAds ?? []) {
        if (ad.meta_id) {
          metaToSupabaseAd.set(ad.meta_id, {
            id: String(ad.id),
            campaignId: String(ad.campaign_id),
          });
        }
      }

      for (const day of dailyInsights) {
        if (!day.ad_id) continue;
        const adInfo = metaToSupabaseAd.get(day.ad_id);
        if (!adInfo) continue;

        const capturedAt = day.date_start;

        const { data: existingSnap } = await supabase
          .from("ad_snapshots")
          .select("id")
          .eq("ad_id", adInfo.id)
          .eq("captured_at", capturedAt)
          .limit(1);

        const snapData = {
          spend: Number(day.spend ?? 0),
          impressions: Number(day.impressions ?? 0),
          clicks: Number(day.clicks ?? 0),
        };

        if (existingSnap && existingSnap.length > 0) {
          await supabase
            .from("ad_snapshots")
            .update(snapData)
            .eq("id", existingSnap[0].id);
        } else {
          await supabase.from("ad_snapshots").insert({
            ad_id: adInfo.id,
            client_id: clientId,
            campaign_id: adInfo.campaignId,
            captured_at: capturedAt,
            ...snapData,
          });
          snapshotsCreated++;
        }
      }

      log.push(`Snapshots: ${snapshotsCreated} created`);
    } catch {
      log.push("Snapshots skipped (ad_snapshots table may not exist)");
    }

    // Revalidate everything
    revalidatePath("/app/dashboard");
    revalidatePath(`/app/clients/${clientId}`);
    revalidatePath("/app/reports");

    return { ok: true, log };
  } catch (err) {
    console.error("Meta sync error:", err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Sync failed",
      log,
    };
  }
}
