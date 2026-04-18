"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "../../../lib/supabase/server";
import { createMetaCampaign } from "../../../lib/meta-campaign-create";

export async function createCampaignAction(clientId: string, formData: FormData) {
  const supabase = await createClient();

  const name = String(formData.get("name") ?? "").trim();
  const objective = String(formData.get("objective") ?? "engagement").trim();
  const audience = String(formData.get("audience") ?? "").trim();
  const budget = Number(formData.get("budget") ?? 0);
  const status = String(formData.get("status") ?? "testing").trim();
  const startDate = String(formData.get("startDate") ?? "").trim();
  const endDate = String(formData.get("endDate") ?? "").trim();
  const placement = String(formData.get("placement") ?? "automatic").trim();

  if (!name) {
    throw new Error("Campaign name is required.");
  }

  // Try to create in Meta first. If Meta creds aren't configured we still
  // save locally — the campaign can be pushed to Meta later or picked up
  // on the next sync. If Meta returns an error we surface it to the
  // operator but don't block the local save.
  let metaCampaignId: string | null = null;
  let metaAdSetId: string | null = null;
  let metaError: string | null = null;

  const hasMetaCreds =
    !!process.env.META_ACCESS_TOKEN && !!process.env.META_AD_ACCOUNT_ID;

  // Save locally FIRST, redirect immediately.
  let insertedId: string;
  try {
    const { data: inserted, error } = await supabase
      .from("campaigns")
      .insert({
        client_id: clientId,
        name,
        objective,
        audience: audience || null,
        budget,
        status,
      })
      .select("id")
      .single();

    if (error || !inserted) {
      console.error("createCampaignAction error:", error);
      throw new Error("Could not create campaign.");
    }
    insertedId = String(inserted.id);
  } catch (err) {
    if ((err as any)?.digest) throw err; // re-throw Next.js internal errors
    throw new Error(err instanceof Error ? err.message : "Could not create campaign.");
  }

  // Fire-and-forget: push to Meta in the background.
  if (hasMetaCreds && budget > 0) {
    createMetaCampaign({
      name,
      objective,
      budgetPounds: budget,
      audience,
      status,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      placement: placement || undefined,
    })
      .then(async (result) => {
        if (result.ok) {
          await supabase
            .from("campaigns")
            .update({
              meta_id: result.metaCampaignId,
              meta_adset_id: result.metaAdSetId,
              meta_status: status === "testing" || status === "paused" ? "PAUSED" : "ACTIVE",
              meta_ad_account_name: process.env.META_AD_ACCOUNT_ID,
            })
            .eq("id", insertedId);
        } else {
          console.error("Background Meta creation failed:", result.error);
        }
      })
      .catch((err) => {
        console.error("Background Meta creation exception:", err);
      });
  }

  revalidatePath(`/admin-panel/clients/${clientId}`);
  redirect(`/app/clients/${clientId}/campaigns/${insertedId}`);
}

export async function assignCampaignToClient(campaignId: string, clientId: string) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("campaigns")
    .update({ client_id: clientId })
    .eq("id", campaignId);

  if (error) {
    console.error("assignCampaignToClient error:", error);
    throw new Error("Could not assign campaign.");
  }

  revalidatePath(`/admin-panel/clients/${clientId}`);
  revalidatePath("/admin-panel/dashboard");
  revalidatePath("/admin-panel/settings");
}

export async function updateCampaignAction(
  clientId: string,
  campaignId: string,
  formData: FormData
) {
  const supabase = await createClient();

  const name = String(formData.get("name") ?? "").trim();
  const objective = String(formData.get("objective") ?? "engagement").trim();
  const audience = String(formData.get("audience") ?? "").trim();
  const budget = Number(formData.get("budget") ?? 0);
  const status = String(formData.get("status") ?? "testing").trim();

  if (!name) {
    throw new Error("Campaign name is required.");
  }

  const { error } = await supabase
    .from("campaigns")
    .update({
      name,
      objective,
      audience: audience || null,
      budget,
      status,
    })
    .eq("id", campaignId)
    .eq("client_id", clientId);

  if (error) {
    console.error("updateCampaignAction error:", error);
    throw new Error("Could not update campaign.");
  }

  revalidatePath(`/admin-panel/clients/${clientId}`);
  revalidatePath("/admin-panel/dashboard");
  redirect(`/app/clients/${clientId}`);
}
