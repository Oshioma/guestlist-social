"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type AssignCampaignInput = {
  campaignId: string;
  clientId: string;
};

export async function assignCampaignToClient({
  campaignId,
  clientId,
}: AssignCampaignInput) {
  const supabase = await createClient();

  // Make sure target client exists
  const { data: client, error: clientError } = await supabase
    .from("clients")
    .select("id, name")
    .eq("id", clientId)
    .single();

  if (clientError || !client) {
    throw new Error("Target client not found.");
  }

  // Load campaign first
  const { data: campaign, error: campaignError } = await supabase
    .from("campaigns")
    .select("id, name, client_id")
    .eq("id", campaignId)
    .single();

  if (campaignError || !campaign) {
    throw new Error("Campaign not found.");
  }

  // Assign campaign to client
  const { error: updateCampaignError } = await supabase
    .from("campaigns")
    .update({ client_id: Number(clientId) })
    .eq("id", campaignId);

  if (updateCampaignError) {
    throw new Error(
      `Failed to assign campaign: ${updateCampaignError.message}`
    );
  }

  // Cascade client assignment to ads in this campaign
  const { error: updateAdsError } = await supabase
    .from("ads")
    .update({ client_id: Number(clientId) })
    .eq("campaign_id", campaignId);

  if (updateAdsError) {
    throw new Error(`Failed to assign ads: ${updateAdsError.message}`);
  }

  revalidatePath(`/admin-panel/clients/${clientId}`);
  revalidatePath(`/admin-panel/clients`);
}
