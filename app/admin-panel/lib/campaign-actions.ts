"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "../../../lib/supabase/server";

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

  const { error } = await supabase.from("campaigns").insert({
    client_id: clientId,
    name,
    objective,
    audience: audience || null,
    budget,
    status,
  });

  if (error) {
    console.error("createCampaignAction error:", error);
    throw new Error("Could not create campaign.");
  }

  revalidatePath(`/app/clients/${clientId}`);
  revalidatePath("/app/dashboard");
  redirect(`/app/clients/${clientId}`);
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

  revalidatePath(`/app/clients/${clientId}`);
  revalidatePath("/app/dashboard");
  redirect(`/app/clients/${clientId}`);
}
