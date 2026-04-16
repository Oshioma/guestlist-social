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

  if (hasMetaCreds && budget > 0) {
    const result = await createMetaCampaign({
      name,
      objective,
      budgetPounds: budget,
      audience,
      status,
    });

    if (result.ok) {
      metaCampaignId = result.metaCampaignId;
      metaAdSetId = result.metaAdSetId;
    } else {
      metaError = `Meta ${result.step}: ${result.error}`;
      console.error("createCampaignAction Meta error:", metaError);
    }
  }

  const { data: inserted, error } = await supabase
    .from("campaigns")
    .insert({
      client_id: clientId,
      name,
      objective,
      audience: audience || null,
      budget,
      status,
      meta_id: metaCampaignId,
      meta_status: metaCampaignId ? (status === "testing" || status === "paused" ? "PAUSED" : "ACTIVE") : null,
      meta_ad_account_name: metaCampaignId ? process.env.META_AD_ACCOUNT_ID : null,
    })
    .select("id")
    .single();

  if (error) {
    console.error("createCampaignAction error:", error);
    throw new Error("Could not create campaign.");
  }

  if (metaError) {
    throw new Error(
      `Campaign saved locally (ID ${inserted.id}) but Meta creation failed: ${metaError}. ` +
      `You can push it to Meta later or add it manually in Ads Manager.`
    );
  }

  revalidatePath(`/admin-panel/clients/${clientId}`);
  revalidatePath("/admin-panel/dashboard");
  redirect(`/app/clients/${clientId}`);
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
