"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "../../../lib/supabase/server";

export async function generateCampaignActions(
  clientId: string,
  campaignId: string
) {
  const supabase = await createClient();

  const { data: adsRows, error: adsError } = await supabase
    .from("ads")
    .select("*")
    .eq("client_id", clientId)
    .eq("campaign_id", campaignId);

  if (adsError || !adsRows) {
    throw new Error("Could not load ads for this campaign.");
  }

  for (const ad of adsRows) {
    const impressions = Number(ad.impressions ?? 0);
    const clicks = Number(ad.clicks ?? 0);
    const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
    const status = String(ad.status ?? "testing");

    let title: string | null = null;
    let priority: "low" | "medium" | "high" = "medium";
    let kind: "pause" | "scale" | "creative" | "review" = "review";

    if (status === "winner" || (ctr >= 2.5 && impressions >= 1000)) {
      title = `[AUTO:${ad.id}] Scale "${ad.name}" — CTR ${ctr.toFixed(1)}%, strong performer`;
      priority = "high";
      kind = "scale";
    } else if (status === "losing" || (ctr < 1.0 && impressions >= 1000)) {
      title = `[AUTO:${ad.id}] Pause or refresh "${ad.name}" — CTR ${ctr.toFixed(1)}%, underperforming`;
      priority = "high";
      kind = "pause";
    } else if (status === "paused") {
      title = `[AUTO:${ad.id}] Review paused ad "${ad.name}" — decide whether to restart or archive`;
      priority = "low";
      kind = "review";
    }

    if (!title) continue;

    // Skip if an open action already exists for this ad
    const { data: existing } = await supabase
      .from("actions")
      .select("id")
      .eq("client_id", clientId)
      .like("title", `[AUTO:${ad.id}]%`)
      .eq("is_complete", false)
      .limit(1);

    if (existing && existing.length > 0) continue;

    await supabase.from("actions").insert({
      client_id: clientId,
      title,
      priority,
      kind,
      is_complete: false,
    });
  }

  revalidatePath(`/app/clients/${clientId}/campaigns/${campaignId}`);
  revalidatePath(`/app/clients/${clientId}`);
  revalidatePath("/app/dashboard");
}
