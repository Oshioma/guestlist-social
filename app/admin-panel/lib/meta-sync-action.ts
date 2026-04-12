"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  getCampaigns,
  getAds,
  getAdSets,
  getAdInsights,
  getDailyAdInsights,
  getAdPlacementInsights,
  getAdDemographicInsights,
  mapMetaStatus,
  mapMetaObjective,
  insightToAdRow,
  creativeToAdRow,
  resolveVideoSource,
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

/**
 * Sync all clients: runs syncMetaData for every non-archived client.
 */
export async function syncAllClients() {
  const supabase = await createClient();

  const { data: clients } = await supabase
    .from("clients")
    .select("id, name")
    .eq("archived", false)
    .order("name", { ascending: true });

  if (!clients || clients.length === 0) {
    return { ok: false, error: "No clients found to sync." };
  }

  const log: string[] = [];
  let allOk = true;

  for (const client of clients) {
    const result = await syncMetaData(String(client.id));
    if (result.log) {
      log.push(...result.log);
    }
    if (!result.ok) {
      allOk = false;
      log.push(`Failed for "${client.name}": ${result.error}`);
    }
    log.push("---");
  }

  revalidatePath("/app/settings");
  revalidatePath("/app/clients");
  revalidatePath("/app/dashboard");

  return { ok: allOk, log };
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

      const { creative_video_id, ...creativeData } = creativeToAdRow(metaAd);

      // Resolve the playable video URL via a separate Graph call. We do
      // this once per ad with a video — never on the hot path of an
      // insight loop. Failures return null and don't break the sync.
      const creative_video_url = creative_video_id
        ? await resolveVideoSource(creative_video_id)
        : null;

      // Everything we want to write on every sync (update OR insert).
      // Spread adData (which contains all the new delivery/funnel/video
      // columns from insightToAdRow) and then layer on the Meta-truth
      // status + creative structure fields.
      const writable = {
        ...adData,
        status: mapMetaStatus(metaAd.status),
        audience,
        creative_hook: creativeHook,
        meta_effective_status: metaAd.effective_status ?? null,
        meta_configured_status: metaAd.configured_status ?? null,
        ...creativeData,
        creative_video_url,
      };

      const { data: existingAd } = await supabase
        .from("ads")
        .select("id")
        .eq("client_id", clientId)
        .eq("meta_id", metaAd.id)
        .limit(1);

      if (existingAd && existingAd.length > 0) {
        await supabase
          .from("ads")
          .update(writable)
          .eq("id", existingAd[0].id);
        adsUpdated++;
      } else {
        await supabase.from("ads").insert({
          client_id: clientId,
          campaign_id: supabaseCampaignId,
          meta_id: metaAd.id,
          ...writable,
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

    // 5. Placement + demographic breakdowns (last 30d).
    // Wrapped in its own try so a schema-not-yet-migrated or API
    // permission hiccup doesn't kill the whole sync.
    try {
      const { data: adRowsForBreakdown } = await supabase
        .from("ads")
        .select("id, meta_id")
        .eq("client_id", clientId);

      const metaToId = new Map<string, string>();
      for (const a of adRowsForBreakdown ?? []) {
        if (a.meta_id) metaToId.set(a.meta_id, String(a.id));
      }

      const [placementRows, demoRows] = await Promise.all([
        getAdPlacementInsights({ datePreset: "last_30d" }),
        getAdDemographicInsights({ datePreset: "last_30d" }),
      ]);

      // Clear the last 30d window for this client's ads so we don't
      // accumulate stale buckets as placements shift.
      const adIds = Array.from(metaToId.values());
      if (adIds.length > 0) {
        await supabase
          .from("ad_placement_insights")
          .delete()
          .in("ad_id", adIds);
        await supabase
          .from("ad_demographic_insights")
          .delete()
          .in("ad_id", adIds);
      }

      let placementsCreated = 0;
      for (const row of placementRows) {
        if (!row.ad_id) continue;
        const localAdId = metaToId.get(row.ad_id);
        if (!localAdId) continue;
        const { error } = await supabase.from("ad_placement_insights").insert({
          ad_id: localAdId,
          client_id: clientId,
          publisher_platform: row.publisher_platform ?? null,
          platform_position: row.platform_position ?? null,
          device_platform: row.device_platform ?? null,
          impressions: Number(row.impressions ?? 0),
          clicks: Number(row.clicks ?? 0),
          spend: Number(row.spend ?? 0),
          ctr: row.ctr ? Number(row.ctr) : null,
          cpm: row.cpm ? Number(row.cpm) : null,
          actions: row.actions ?? null,
          date_start: row.date_start,
          date_stop: row.date_stop,
        });
        if (!error) placementsCreated++;
      }

      let demosCreated = 0;
      for (const row of demoRows) {
        if (!row.ad_id) continue;
        const localAdId = metaToId.get(row.ad_id);
        if (!localAdId) continue;
        const { error } = await supabase
          .from("ad_demographic_insights")
          .insert({
            ad_id: localAdId,
            client_id: clientId,
            age: row.age ?? null,
            gender: row.gender ?? null,
            impressions: Number(row.impressions ?? 0),
            clicks: Number(row.clicks ?? 0),
            spend: Number(row.spend ?? 0),
            ctr: row.ctr ? Number(row.ctr) : null,
            actions: row.actions ?? null,
            date_start: row.date_start,
            date_stop: row.date_stop,
          });
        if (!error) demosCreated++;
      }

      log.push(
        `Breakdowns: ${placementsCreated} placement, ${demosCreated} demographic`
      );
    } catch (err) {
      log.push(
        `Breakdowns skipped (${
          err instanceof Error ? err.message : "unknown error"
        })`
      );
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
