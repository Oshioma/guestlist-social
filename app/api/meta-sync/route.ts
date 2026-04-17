import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { persistImageToStorage } from "@/lib/persist-image";
import {
  getAdAccount,
  getCampaigns,
  getAds,
  getAdSets,
  getAdInsights,
  getDailyAdInsights,
  mapMetaStatus,
  mapMetaObjective,
  insightToAdRow,
  creativeToAdRow,
  resolveVideoSource,
  resolveVideoPoster,
  resolveObjectStoryImage,
  targetingToAudience,
} from "@/lib/meta";

/**
 * GET /api/meta-sync
 *
 * Full sync:
 * - pulls campaigns, ads, insights, and daily snapshots from Meta
 * - upserts by meta_id
 * - preserves any existing manual client assignment
 * - stores which Meta ad account the data came from
 *
 * Query params:
 *   range — optional, default "last_year"
 *
 * Important:
 * - New campaigns are created with client_id = null
 * - Existing campaigns keep their assigned client_id
 * - Ads inherit client_id from their linked campaign where possible
 * - No more forcing all records into one app client like "NBSN"
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const range = searchParams.get("range") ?? "last_year";

  try {
    // Service-role client, not the SSR cookie client. The sync needs to
    // INSERT new campaigns/ads/audiences when Meta returns objects that
    // didn't exist locally before, and the campaigns table has RLS that
    // doesn't grant INSERT to the publishable key. Service role bypasses
    // RLS entirely, which is the right call here — this is a backend sync
    // running from the cron / pipeline, not a user-facing mutation.
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
    const log: string[] = [];

    // ---------------------------------------------------------------
    // 0. Verify Meta account and capture account identity
    // ---------------------------------------------------------------
    const adAccount = await getAdAccount();

    const metaAdAccountId = adAccount?.id
      ? String(adAccount.id).startsWith("act_")
        ? String(adAccount.id)
        : `act_${adAccount.id}`
      : null;

    const metaAdAccountName = adAccount?.name ?? null;

    log.push(
      `Syncing Meta ad account "${metaAdAccountName ?? "Unknown"}" (${metaAdAccountId ?? "unknown"})`
    );

    // ---------------------------------------------------------------
    // 1. Campaigns
    // ---------------------------------------------------------------
    const metaCampaigns = await getCampaigns();
    log.push(`Fetched ${metaCampaigns.length} campaigns from Meta`);

    const existingCampaignMetaIds = metaCampaigns
      .map((c) => c.id)
      .filter(Boolean);

    const existingCampaignsByMetaId = new Map<
      string,
      { id: number; client_id: number | null }
    >();

    if (existingCampaignMetaIds.length > 0) {
      const { data: existingCampaigns, error: existingCampaignsError } =
        await supabase
          .from("campaigns")
          .select("id, client_id, meta_id")
          .in("meta_id", existingCampaignMetaIds);

      if (existingCampaignsError) {
        throw new Error(
          `Failed loading existing campaigns: ${existingCampaignsError.message}`
        );
      }

      for (const row of existingCampaigns ?? []) {
        if (!row.meta_id) continue;

        existingCampaignsByMetaId.set(String(row.meta_id), {
          id: Number(row.id),
          client_id:
            row.client_id === null || row.client_id === undefined
              ? null
              : Number(row.client_id),
        });
      }
    }

    const campaignMap = new Map<
      string,
      { id: number; client_id: number | null }
    >();

    let campaignsCreated = 0;
    let campaignsUpdated = 0;

    for (const mc of metaCampaigns) {
      const budget =
        Number(mc.daily_budget ?? mc.lifetime_budget ?? 0) / 100;

      const existing = existingCampaignsByMetaId.get(String(mc.id));

      const campaignData = {
        name: mc.name,
        status: mapMetaStatus(mc.status),
        meta_status: mc.status ?? null,
        objective: mapMetaObjective(mc.objective),
        budget,
        meta_ad_account_id: metaAdAccountId,
        meta_ad_account_name: metaAdAccountName,
      };

      if (existing) {
        const { error: updateError } = await supabase
          .from("campaigns")
          .update(campaignData)
          .eq("id", existing.id);

        if (updateError) {
          throw new Error(
            `Failed updating campaign ${mc.name}: ${updateError.message}`
          );
        }

        campaignMap.set(String(mc.id), {
          id: existing.id,
          client_id: existing.client_id,
        });

        campaignsUpdated++;
      } else {
        const { data: newCampaign, error: insertError } = await supabase
          .from("campaigns")
          .insert({
            client_id: null,
            meta_id: mc.id,
            ...campaignData,
          })
          .select("id, client_id")
          .single();

        if (insertError) {
          throw new Error(
            `Failed creating campaign ${mc.name}: ${insertError.message}`
          );
        }

        if (newCampaign) {
          campaignMap.set(String(mc.id), {
            id: Number(newCampaign.id),
            client_id:
              newCampaign.client_id === null ||
              newCampaign.client_id === undefined
                ? null
                : Number(newCampaign.client_id),
          });

          campaignsCreated++;
        }
      }
    }

    log.push(
      `Campaigns: ${campaignsCreated} created, ${campaignsUpdated} updated`
    );

    // ---------------------------------------------------------------
    // 2. Ad Sets (for audience / targeting helper)
    // ---------------------------------------------------------------
    const metaAdSets = await getAdSets();
    log.push(`Fetched ${metaAdSets.length} ad sets from Meta`);

    const adSetAudienceMap = new Map<string, string>();
    for (const adSet of metaAdSets) {
      adSetAudienceMap.set(adSet.id, targetingToAudience(adSet));
    }

    // ---------------------------------------------------------------
    // 3. Ads + Insights
    // ---------------------------------------------------------------
    const [metaAds, insights] = await Promise.all([
      getAds(),
      getAdInsights({ datePreset: range as any }),
    ]);

    log.push(
      `Fetched ${metaAds.length} ads and ${insights.length} insight rows from Meta`
    );

    const insightByAdId = new Map(
      insights
        .filter((i) => i.ad_id)
        .map((i) => [String(i.ad_id), i])
    );

    const existingAdMetaIds = metaAds.map((a) => a.id).filter(Boolean);

    const existingAdsByMetaId = new Map<
      string,
      {
        id: number;
        client_id: number | null;
        campaign_id: number | null;
      }
    >();

    if (existingAdMetaIds.length > 0) {
      const { data: existingAds, error: existingAdsError } = await supabase
        .from("ads")
        .select("id, client_id, campaign_id, meta_id")
        .in("meta_id", existingAdMetaIds);

      if (existingAdsError) {
        throw new Error(
          `Failed loading existing ads: ${existingAdsError.message}`
        );
      }

      for (const row of existingAds ?? []) {
        if (!row.meta_id) continue;

        existingAdsByMetaId.set(String(row.meta_id), {
          id: Number(row.id),
          client_id:
            row.client_id === null || row.client_id === undefined
              ? null
              : Number(row.client_id),
          campaign_id:
            row.campaign_id === null || row.campaign_id === undefined
              ? null
              : Number(row.campaign_id),
        });
      }
    }

    let adsCreated = 0;
    let adsUpdated = 0;

    for (const metaAd of metaAds) {
      const campaignInfo = campaignMap.get(String(metaAd.campaign_id));
      const linkedCampaignId = campaignInfo?.id ?? null;
      const inheritedClientId = campaignInfo?.client_id ?? null;

      const insight = insightByAdId.get(String(metaAd.id));

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

      const audience = adSetAudienceMap.get(String(metaAd.adset_id)) ?? null;

      const creativeHook = metaAd.creative
        ? [metaAd.creative.title, metaAd.creative.body]
            .filter(Boolean)
            .join(" — ") || null
        : null;

      // Pull structured creative fields + classifier output. Mirrors what
      // meta-sync-action.ts already does — without this, the global sync
      // path leaves creative_type / hook_type / format_style unpopulated
      // and the cross-pollinate engine has no patterns to discover.
      const { creative_video_id, ...creativeData } = creativeToAdRow(metaAd);

      // Resolve playable video URL via a separate Graph call. One call per
      // video ad — failures return null and don't break the sync.
      const creative_video_url = creative_video_id
        ? await resolveVideoSource(creative_video_id)
        : null;

      // Thumbnail fallback chain — same as meta-sync-action.ts. Without
      // these fallbacks a meaningful slice of the library renders as
      // "No preview" on the per-client Ads page.
      let creative_image_url = creativeData.creative_image_url;
      if (!creative_image_url && creative_video_id) {
        creative_image_url = await resolveVideoPoster(creative_video_id);
      }
      if (!creative_image_url && creativeData.object_story_id) {
        creative_image_url = await resolveObjectStoryImage(
          creativeData.object_story_id
        );
      }

      // Persist the image to Supabase Storage so it never expires.
      // Fire-and-forget: don't await — sync must stay fast to avoid
      // Vercel timeout. The URL gets updated on the next sync if this
      // one doesn't finish in time.
      if (creative_image_url && !creative_image_url.includes("supabase.co/storage/")) {
        const metaUrl = creative_image_url;
        const adMetaId = String(metaAd.id);
        persistImageToStorage(metaUrl, `meta-creatives/${adMetaId}`)
          .then(async (persisted) => {
            if (persisted) {
              await supabase
                .from("ads")
                .update({ creative_image_url: persisted })
                .eq("meta_id", adMetaId);
            }
          })
          .catch(() => {});
      }

      const existingAd = existingAdsByMetaId.get(String(metaAd.id));

      if (existingAd) {
        const { error: updateError } = await supabase
          .from("ads")
          .update({
            name: adData.name,
            status: mapMetaStatus(metaAd.status),
            meta_status: metaAd.status ?? null,
            spend: adData.spend,
            impressions: adData.impressions,
            clicks: adData.clicks,
            cost_per_result: adData.cost_per_result,
            conversions: adData.conversions,
            engagement: adData.engagement,
            audience,
            creative_hook: creativeHook,
            // Cached so meta_execution_queue seeders can attach the ad set
            // Meta id without re-walking the adsets list.
            adset_meta_id: metaAd.adset_id ?? null,
            ...creativeData,
            creative_image_url,
            creative_video_url,
            meta_ad_account_id: metaAdAccountId,
            meta_ad_account_name: metaAdAccountName,
            client_id: existingAd.client_id ?? inheritedClientId ?? null,
            campaign_id: linkedCampaignId ?? existingAd.campaign_id ?? null,
          })
          .eq("id", existingAd.id);

        if (updateError) {
          throw new Error(
            `Failed updating ad ${metaAd.name}: ${updateError.message}`
          );
        }

        adsUpdated++;
      } else {
        const { error: insertError } = await supabase.from("ads").insert({
          client_id: inheritedClientId ?? null,
          campaign_id: linkedCampaignId ?? null,
          meta_id: metaAd.id,
          name: adData.name,
          status: mapMetaStatus(metaAd.status),
          meta_status: metaAd.status ?? null,
          spend: adData.spend,
          impressions: adData.impressions,
          clicks: adData.clicks,
          cost_per_result: adData.cost_per_result,
          conversions: adData.conversions,
          engagement: adData.engagement,
          followers_gained: adData.followers_gained ?? 0,
          audience,
          creative_hook: creativeHook,
          adset_meta_id: metaAd.adset_id ?? null,
          ...creativeData,
          creative_image_url,
          creative_video_url,
          meta_ad_account_id: metaAdAccountId,
          meta_ad_account_name: metaAdAccountName,
        });

        if (insertError) {
          throw new Error(
            `Failed creating ad ${metaAd.name}: ${insertError.message}`
          );
        }

        adsCreated++;
      }
    }

    log.push(`Ads: ${adsCreated} created, ${adsUpdated} updated`);

    // ---------------------------------------------------------------
    // 4. Daily snapshots (last 30 days)
    // ---------------------------------------------------------------
    let snapshotsCreated = 0;

    try {
      const dailyInsights = await getDailyAdInsights({
        datePreset: "last_30d",
      });

      log.push(
        `Fetched ${dailyInsights.length} daily insight rows for snapshots`
      );

      const { data: allAds, error: allAdsError } = await supabase
        .from("ads")
        .select("id, meta_id, campaign_id, client_id, meta_ad_account_id")
        .eq("meta_ad_account_id", metaAdAccountId);

      if (allAdsError) {
        throw new Error(
          `Failed loading ads for snapshots: ${allAdsError.message}`
        );
      }

      const metaToSupabaseAd = new Map<
        string,
        { id: number; campaignId: number | null; clientId: number | null }
      >();

      for (const ad of allAds ?? []) {
        if (!ad.meta_id) continue;

        metaToSupabaseAd.set(String(ad.meta_id), {
          id: Number(ad.id),
          campaignId:
            ad.campaign_id === null || ad.campaign_id === undefined
              ? null
              : Number(ad.campaign_id),
          clientId:
            ad.client_id === null || ad.client_id === undefined
              ? null
              : Number(ad.client_id),
        });
      }

      for (const day of dailyInsights) {
        if (!day.ad_id) continue;

        const adInfo = metaToSupabaseAd.get(String(day.ad_id));
        if (!adInfo) continue;

        const capturedAt = day.date_start;

        const { data: existingSnap, error: existingSnapError } = await supabase
          .from("ad_snapshots")
          .select("id")
          .eq("ad_id", adInfo.id)
          .eq("captured_at", capturedAt)
          .limit(1);

        if (existingSnapError) {
          throw new Error(
            `Failed checking existing snapshot for ad ${day.ad_id}: ${existingSnapError.message}`
          );
        }

        const snapData = {
          spend: Number(day.spend ?? 0),
          impressions: Number(day.impressions ?? 0),
          clicks: Number(day.clicks ?? 0),
        };

        if (existingSnap && existingSnap.length > 0) {
          const { error: updateSnapError } = await supabase
            .from("ad_snapshots")
            .update(snapData)
            .eq("id", existingSnap[0].id);

          if (updateSnapError) {
            throw new Error(
              `Failed updating snapshot for ad ${day.ad_id}: ${updateSnapError.message}`
            );
          }
        } else {
          const { error: insertSnapError } = await supabase
            .from("ad_snapshots")
            .insert({
              ad_id: adInfo.id,
              client_id: adInfo.clientId,
              campaign_id: adInfo.campaignId,
              captured_at: capturedAt,
              ...snapData,
            });

          if (insertSnapError) {
            throw new Error(
              `Failed creating snapshot for ad ${day.ad_id}: ${insertSnapError.message}`
            );
          }

          snapshotsCreated++;
        }
      }

      log.push(`Snapshots: ${snapshotsCreated} created`);
    } catch (e) {
      log.push(
        `Snapshots skipped: ${
          e instanceof Error ? e.message : "ad_snapshots table may not exist"
        }`
      );
    }

    // ---------------------------------------------------------------
    // 5. Summary
    // ---------------------------------------------------------------
    const { count: unassignedCampaigns } = await supabase
      .from("campaigns")
      .select("*", { count: "exact", head: true })
      .is("client_id", null)
      .eq("meta_ad_account_id", metaAdAccountId);

    return Response.json({
      ok: true,
      metaAccount: {
        id: metaAdAccountId,
        name: metaAdAccountName,
      },
      campaigns: {
        total: metaCampaigns.length,
        created: campaignsCreated,
        updated: campaignsUpdated,
        unassigned: unassignedCampaigns ?? 0,
      },
      ads: {
        total: metaAds.length,
        created: adsCreated,
        updated: adsUpdated,
      },
      snapshots: snapshotsCreated,
      log,
    });
  } catch (err) {
    console.error("Meta sync error:", err);

    return Response.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Sync failed",
      },
      { status: 500 }
    );
  }
}
