"use server";

import { createClient } from "../../../lib/supabase/server";

export async function captureAdSnapshot(
  adId: string,
  clientId: string,
  campaignId: string,
  spend: number,
  impressions: number,
  clicks: number
) {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  // Check if there's already a snapshot for this ad today
  const { data: existing } = await supabase
    .from("ad_snapshots")
    .select("id")
    .eq("ad_id", adId)
    .eq("captured_at", today)
    .limit(1);

  if (existing && existing.length > 0) {
    // Update today's snapshot with latest numbers
    const { error } = await supabase
      .from("ad_snapshots")
      .update({ spend, impressions, clicks })
      .eq("id", existing[0].id);

    if (error) {
      console.error("captureAdSnapshot update error:", error);
    }
    return;
  }

  // Insert new snapshot
  const { error } = await supabase.from("ad_snapshots").insert({
    ad_id: adId,
    client_id: clientId,
    campaign_id: campaignId,
    spend,
    impressions,
    clicks,
    captured_at: today,
  });

  if (error) {
    console.error("captureAdSnapshot insert error:", error);
  }
}

export type AdTrend = {
  adId: string;
  ctrNow: number;
  ctrBefore: number;
  ctrChange: number;
  direction: "up" | "down" | "flat";
  daysCompared: number;
};

export async function getAdTrends(
  clientId: string,
  campaignId: string
): Promise<AdTrend[]> {
  const supabase = await createClient();

  // Fetch all snapshots for this campaign's ads from the last 7 days
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const cutoff = sevenDaysAgo.toISOString().slice(0, 10);

  const { data: snapshots, error } = await supabase
    .from("ad_snapshots")
    .select("ad_id, spend, impressions, clicks, captured_at")
    .eq("client_id", clientId)
    .eq("campaign_id", campaignId)
    .gte("captured_at", cutoff)
    .order("captured_at", { ascending: true });

  if (error || !snapshots || snapshots.length === 0) {
    return [];
  }

  // Group by ad_id
  const grouped: Record<string, typeof snapshots> = {};
  for (const snap of snapshots) {
    const adId = String(snap.ad_id);
    if (!grouped[adId]) grouped[adId] = [];
    grouped[adId].push(snap);
  }

  const trends: AdTrend[] = [];

  for (const [adId, adSnaps] of Object.entries(grouped)) {
    if (adSnaps.length < 2) continue;

    const latest = adSnaps[adSnaps.length - 1];
    const earliest = adSnaps[0];

    const ctrNow =
      Number(latest.impressions) > 0
        ? (Number(latest.clicks) / Number(latest.impressions)) * 100
        : 0;
    const ctrBefore =
      Number(earliest.impressions) > 0
        ? (Number(earliest.clicks) / Number(earliest.impressions)) * 100
        : 0;

    const ctrChange = ctrBefore > 0 ? ((ctrNow - ctrBefore) / ctrBefore) * 100 : 0;

    const daysDiff = Math.max(
      1,
      Math.round(
        (new Date(String(latest.captured_at)).getTime() -
          new Date(String(earliest.captured_at)).getTime()) /
          86400000
      )
    );

    let direction: "up" | "down" | "flat" = "flat";
    if (ctrChange >= 5) direction = "up";
    else if (ctrChange <= -5) direction = "down";

    trends.push({
      adId,
      ctrNow: Number(ctrNow.toFixed(2)),
      ctrBefore: Number(ctrBefore.toFixed(2)),
      ctrChange: Number(ctrChange.toFixed(1)),
      direction,
      daysCompared: daysDiff,
    });
  }

  return trends;
}
