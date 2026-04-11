"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "../../../lib/supabase/server";

function normalizeAdStatus(status: string) {
  if (status === "winner" || status === "testing" || status === "losing" || status === "paused") {
    return status;
  }
  return "testing";
}

export async function createAdAction(
  clientId: string,
  campaignId: string,
  formData: FormData
) {
  const supabase = await createClient();

  const name = String(formData.get("name") ?? "").trim();
  const spend = Number(formData.get("spend") ?? 0);
  const impressions = Number(formData.get("impressions") ?? 0);
  const clicks = Number(formData.get("clicks") ?? 0);
  const engagement = Number(formData.get("engagement") ?? 0);
  const conversions = Number(formData.get("conversions") ?? 0);
  const audience = String(formData.get("audience") ?? "").trim();
  const creativeHook = String(formData.get("creativeHook") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const status = normalizeAdStatus(String(formData.get("status") ?? "testing"));

  if (!name) {
    throw new Error("Ad name is required.");
  }

  const costPerResult =
    clicks > 0 && spend > 0 ? Number((spend / clicks).toFixed(4)) : 0;

  const { error } = await supabase.from("ads").insert({
    client_id: clientId,
    campaign_id: campaignId,
    name,
    status,
    spend,
    cost_per_result: costPerResult,
    followers_gained: 0,
    clicks,
    engagement,
    impressions,
    conversions,
    audience: audience || null,
    creative_hook: creativeHook || null,
    notes: notes || null,
  });

  if (error) {
    console.error("createAdAction error:", error);
    throw new Error("Could not create ad.");
  }

  revalidatePath(`/app/clients/${clientId}`);
  revalidatePath(`/app/clients/${clientId}/ads`);
  revalidatePath(`/app/clients/${clientId}/campaigns/${campaignId}/edit`);
  revalidatePath("/app/dashboard");

  redirect(`/app/clients/${clientId}`);
}

export async function updateAdAction(
  clientId: string,
  campaignId: string,
  adId: string,
  formData: FormData
) {
  const supabase = await createClient();

  const name = String(formData.get("name") ?? "").trim();
  const spend = Number(formData.get("spend") ?? 0);
  const impressions = Number(formData.get("impressions") ?? 0);
  const clicks = Number(formData.get("clicks") ?? 0);
  const engagement = Number(formData.get("engagement") ?? 0);
  const conversions = Number(formData.get("conversions") ?? 0);
  const audience = String(formData.get("audience") ?? "").trim();
  const creativeHook = String(formData.get("creativeHook") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const status = normalizeAdStatus(String(formData.get("status") ?? "testing"));

  if (!adId) {
    throw new Error("Missing ad id.");
  }

  if (!name) {
    throw new Error("Ad name is required.");
  }

  const costPerResult =
    clicks > 0 && spend > 0 ? Number((spend / clicks).toFixed(4)) : 0;

  const { error } = await supabase
    .from("ads")
    .update({
      name,
      status,
      spend,
      cost_per_result: costPerResult,
      clicks,
      engagement,
      impressions,
      conversions,
      audience: audience || null,
      creative_hook: creativeHook || null,
      notes: notes || null,
    })
    .eq("id", adId)
    .eq("client_id", clientId)
    .eq("campaign_id", campaignId);

  if (error) {
    console.error("updateAdAction error:", error);
    throw new Error("Could not update ad.");
  }

  revalidatePath(`/app/clients/${clientId}`);
  revalidatePath(`/app/clients/${clientId}/ads`);
  revalidatePath(`/app/clients/${clientId}/campaigns/${campaignId}/edit`);
  revalidatePath(
    `/app/clients/${clientId}/campaigns/${campaignId}/ads/${adId}/edit`
  );
  revalidatePath("/app/dashboard");

  redirect(`/app/clients/${clientId}`);
}
