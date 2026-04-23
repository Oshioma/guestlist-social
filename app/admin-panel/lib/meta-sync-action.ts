"use server";

import { revalidatePath } from "next/cache";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import {
  getCampaigns,
  getAdsLight,
  getAdAccount,
  getAdInsights,
  getDailyAdInsights,
  getAdPlacementInsights,
  getAdDemographicInsights,
  mapMetaStatus,
  mapMetaObjective,
  creativeToAdRow,
  resolveVideoSource,
  resolveVideoPoster,
  resolveObjectStoryImage,
} from "@/lib/meta";

// Service-role client. Same reasoning as /api/meta-sync: this file's
// sync routines INSERT new campaigns/ads when Meta returns objects we
// haven't seen before, and the campaigns table has RLS that doesn't
// grant INSERT to the publishable key. Backend sync code shouldn't
// depend on a logged-in user's row policies — service role is the
// right call.
function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing Supabase env vars");
  }
  return createAdminClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Import from Meta: creates a client from the ad account name,
 * then syncs all campaigns, ads, and insights into it.
 */
export async function importFromMeta() {
  const supabase = adminClient();

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

    revalidatePath("/admin-panel/settings");
    revalidatePath("/admin-panel/clients");

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
  const supabase = adminClient();

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

  revalidatePath("/admin-panel/settings");
  revalidatePath("/admin-panel/clients");
  revalidatePath("/admin-panel/dashboard");

  return { ok: allOk, log };
}

export async function syncMetaData(clientId: string) {
  const supabase = adminClient();

  // Verify client exists
  const { data: client, error: clientError } = await supabase
    .from("clients")
    .select("id, name, meta_ad_account_id")
    .eq("id", clientId)
    .single();

  if (clientError || !client) {
    return { ok: false, error: `Client ${clientId} not found` };
  }

  const log: string[] = [];

  try {
    log.push(`Syncing Meta data for "${client.name}"`);

    // 1. Campaigns — single page, active/paused/completed
    const { token, accountId } = (() => {
      const t = process.env.META_ACCESS_TOKEN;
      let a = (client as any).meta_ad_account_id || process.env.META_AD_ACCOUNT_ID;
      if (!t || !a) throw new Error("Missing META env vars");
      if (!a.startsWith("act_")) a = `act_${a}`;
      return { token: t, accountId: a };
    })();
    log.push(`Using ad account: ${accountId}`);

    const campRes = await fetch(
      `https://graph.facebook.com/v25.0/${accountId}/campaigns?fields=id,name,status,objective,daily_budget,lifetime_budget&limit=50&access_token=${token}`,
      { cache: "no-store" }
    );
    if (!campRes.ok) throw new Error(`Meta campaigns: ${campRes.status}`);
    const campData = await campRes.json();
    const metaCampaigns: Array<{ id: string; name: string; status: string; objective: string; daily_budget?: string; lifetime_budget?: string }> = campData.data ?? [];
    log.push(`Fetched ${metaCampaigns.length} campaigns from Meta`);

    // Pre-fetch existing campaigns FOR THIS CLIENT only
    const { data: existingCampaigns } = await supabase
      .from("campaigns")
      .select("id, meta_id")
      .eq("client_id", clientId);
    const existingCampByMetaId = new Map(
      (existingCampaigns ?? []).map((c) => [String(c.meta_id), String(c.id)])
    );

    // Also check which meta_ids exist on OTHER clients (to avoid duplicating)
    const { data: allCampaigns } = await supabase
      .from("campaigns")
      .select("meta_id, client_id")
      .not("client_id", "eq", clientId);
    const ownedByOther = new Set(
      (allCampaigns ?? []).map((c) => String(c.meta_id))
    );

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

      const existingCampId = existingCampByMetaId.get(String(mc.id));

      if (existingCampId) {
        // Already belongs to this client — update
        campaignMap.set(mc.id, existingCampId);
        await supabase
          .from("campaigns")
          .update(campaignData)
          .eq("id", existingCampId);
        campaignsUpdated++;
      } else if (!ownedByOther.has(String(mc.id))) {
        // Not owned by anyone — create for this client
        const { data: newCampaign } = await supabase
          .from("campaigns")
          .insert({ client_id: clientId, meta_id: mc.id, ...campaignData })
          .select("id")
          .single();

        if (newCampaign) {
          campaignMap.set(mc.id, String(newCampaign.id));
          campaignsCreated++;
        }
      // Owned by another client — check if campaign name matches THIS client
      } else {
        const campNameLower = (mc.name ?? "").toLowerCase();
        const clientNameLower = (client.name ?? "").toLowerCase();
        const clientWords = clientNameLower.split(/\s+/).filter((w: string) => w.length > 2);
        const nameMatches = clientWords.some((w: string) => campNameLower.includes(w));

        if (nameMatches) {
          // Campaign name contains the client name — reassign it
          const { data: otherCamp } = await supabase
            .from("campaigns")
            .select("id")
            .eq("meta_id", mc.id)
            .neq("client_id", clientId)
            .limit(1)
            .maybeSingle();

          if (otherCamp) {
            await supabase
              .from("campaigns")
              .update({ client_id: clientId, ...campaignData })
              .eq("id", otherCamp.id);
            // Also move ads from old client to this client
            await supabase
              .from("ads")
              .update({ client_id: clientId })
              .eq("campaign_id", otherCamp.id);
            campaignMap.set(mc.id, String(otherCamp.id));
            campaignsUpdated++;
            log.push(`Claimed "${mc.name}" (matched client name)`);
          }
        } else {
          log.push(`Skipped "${mc.name}" (belongs to another client)`);
        }
      }
    }

    log.push(`Campaigns: ${campaignsCreated} created, ${campaignsUpdated} updated`);

    // 2. Ads — fetch 10 active/paused ads, single page, no pagination.
    const adsRes = await fetch(
      `https://graph.facebook.com/v25.0/${accountId}/ads?fields=id,name,status,effective_status,adset_id,campaign_id,creative{id,image_url,thumbnail_url,object_story_spec}&limit=50&access_token=${token}`,
      { cache: "no-store" }
    );
    const metaAds: Array<{ id: string; name: string; status: string; effective_status?: string; adset_id?: string; campaign_id: string; creative?: { id?: string; image_url?: string; thumbnail_url?: string } }> =
      adsRes.ok ? ((await adsRes.json()).data ?? []) : [];
    log.push(`Fetched ${metaAds.length} ads`);

    // Pre-fetch all existing ads for this client in one query
    const { data: existingAds } = await supabase
      .from("ads")
      .select("id, meta_id")
      .eq("client_id", clientId);
    const existingAdByMetaId = new Map(
      (existingAds ?? []).map((a) => [String(a.meta_id), String(a.id)])
    );

    let adsCreated = 0;
    let adsUpdated = 0;

    for (const metaAd of metaAds) {
      const supabaseCampaignId = campaignMap.get(metaAd.campaign_id);
      if (!supabaseCampaignId) continue;

      const adData = {
        name: metaAd.name,
        spend: 0,
        impressions: 0,
        clicks: 0,
        cost_per_result: 0,
        conversions: 0,
        engagement: 0,
        followers_gained: 0,
      };

      // Prefer full-size image_url, then try object_story_spec, fallback to thumbnail
      const storySpec = (metaAd.creative as any)?.object_story_spec;
      const storyImage = storySpec?.link_data?.picture ?? storySpec?.link_data?.image_url ?? storySpec?.photo_data?.url ?? null;
      const creative_image_url =
        metaAd.creative?.image_url ??
        storyImage ??
        metaAd.creative?.thumbnail_url ??
        null;

      const writable: Record<string, unknown> = {
        ...adData,
        name: metaAd.name,
        status: mapMetaStatus(metaAd.status),
        meta_effective_status: metaAd.effective_status ?? null,
        adset_meta_id: metaAd.adset_id ?? null,
      };

      // Only update image if we got a new one
      if (creative_image_url) {
        writable.creative_image_url = creative_image_url;
      }

      const existingAdId = existingAdByMetaId.get(String(metaAd.id));

      if (existingAdId) {
        await supabase
          .from("ads")
          .update(writable)
          .eq("id", existingAdId);
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
      const dailyInsights = await getDailyAdInsights({ datePreset: "last_30d", accountId });

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

      // Roll up snapshot totals into the ads table
      const { data: adTotals } = await supabase
        .from("ad_snapshots")
        .select("ad_id, spend, impressions, clicks")
        .eq("client_id", clientId);

      if (adTotals && adTotals.length > 0) {
        const totals = new Map<string, { spend: number; impressions: number; clicks: number }>();
        for (const row of adTotals) {
          const key = String(row.ad_id);
          const curr = totals.get(key) ?? { spend: 0, impressions: 0, clicks: 0 };
          curr.spend += Number(row.spend ?? 0);
          curr.impressions += Number(row.impressions ?? 0);
          curr.clicks += Number(row.clicks ?? 0);
          totals.set(key, curr);
        }

        // Parse conversions from the insights actions field
        const RESULT_ACTION_TYPES = new Set([
          "lead", "onsite_conversion.lead_grouped",
          "offsite_conversion.fb_pixel_lead",
          "onsite_conversion.messaging_first_reply",
          "onsite_conversion.messaging_conversation_started_7d",
          "purchase", "complete_registration",
          "offsite_conversion.fb_pixel_purchase",
          "offsite_conversion.fb_pixel_complete_registration",
          "submit_application", "contact_total",
        ]);

        const conversionsByMetaAdId = new Map<string, { conversions: number; costPerResult: number }>();
        const seenActionTypes = new Set<string>();

        for (const day of dailyInsights) {
          if (!day.ad_id) continue;
          const actions = day.actions ?? [];
          const costActions = day.cost_per_action_type ?? [];

          for (const a of actions) {
            seenActionTypes.add(a.action_type);
          }

          let totalResults = 0;
          for (const a of actions) {
            if (RESULT_ACTION_TYPES.has(a.action_type)) {
              totalResults += Number(a.value ?? 0);
            }
          }
          if (totalResults > 0) {
            const existing = conversionsByMetaAdId.get(day.ad_id) ?? { conversions: 0, costPerResult: 0 };
            existing.conversions += totalResults;
            for (const c of costActions) {
              if (RESULT_ACTION_TYPES.has(c.action_type)) {
                existing.costPerResult = Number(c.value ?? 0);
              }
            }
            conversionsByMetaAdId.set(day.ad_id, existing);
          }
        }

        if (seenActionTypes.size > 0) {
          log.push(`Action types seen: ${Array.from(seenActionTypes).join(", ")}`);
        }

        for (const [adId, t] of totals) {
          const ctr = t.impressions > 0 ? Number(((t.clicks / t.impressions) * 100).toFixed(2)) : 0;
          const cpc = t.clicks > 0 ? Number((t.spend / t.clicks).toFixed(4)) : 0;

          const adRow = (allAds ?? []).find((a) => String(a.id) === adId);
          const metaAdId = adRow?.meta_id;
          const conv = metaAdId ? conversionsByMetaAdId.get(metaAdId) : null;

          const updateData: Record<string, unknown> = {
            spend: t.spend,
            impressions: t.impressions,
            clicks: t.clicks,
            conversions: conv?.conversions ?? 0,
            cost_per_result: conv && conv.conversions > 0 ? Number((t.spend / conv.conversions).toFixed(4)) : 0,
          };
          let { error: updateErr } = await supabase
            .from("ads")
            .update(updateData)
            .eq("id", adId);
          if (updateErr) {
            // Remove columns that might not exist and retry
            delete updateData.conversions;
            delete updateData.cost_per_result;
            const retry = await supabase.from("ads").update(updateData).eq("id", adId);
            updateErr = retry.error;
          }
          if (updateErr) {
            log.push(`Failed to update ad ${adId}: ${updateErr.message}`);
          }
        }
        log.push(`Rolled up spend for ${totals.size} ads`);
      }
    } catch (err) {
      log.push(`Snapshots error: ${err instanceof Error ? err.message : "unknown"}`);
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
        getAdPlacementInsights({ datePreset: "last_30d", accountId }),
        getAdDemographicInsights({ datePreset: "last_30d", accountId }),
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
    revalidatePath("/admin-panel/dashboard");
    revalidatePath(`/admin-panel/clients/${clientId}`);
    revalidatePath("/admin-panel/reports");

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
