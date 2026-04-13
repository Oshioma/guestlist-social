"use server";

import { createClient } from "../../../lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function createLearningFromAction(
  clientId: string,
  campaignId: string,
  adId: string | null,
  actionId: string,
  formData: FormData
) {
  const supabase = await createClient();

  const problem = String(formData.get("problem") ?? "").trim();
  const changeMade = String(formData.get("changeMade") ?? "").trim();
  const result = String(formData.get("result") ?? "").trim();
  const outcome = String(formData.get("outcome") ?? "").trim();

  if (!problem || !changeMade) {
    throw new Error("Problem and change made are required.");
  }

  const { error } = await supabase.from("learnings").insert({
    client_id: clientId,
    campaign_id: campaignId,
    ad_id: adId,
    action_id: actionId,
    problem,
    change_made: changeMade,
    result,
    outcome,
  });

  if (error) {
    console.error("createLearningFromAction error:", error);
    throw new Error("Could not save learning.");
  }

  revalidatePath(`/admin-panel/clients/${clientId}`);
  revalidatePath(`/admin-panel/clients/${clientId}/campaigns/${campaignId}`);
}
