"use server";

import { createClient } from "../../../lib/supabase/server";
import { revalidatePath } from "next/cache";
import { generateSuggestionsFromLearnings } from "./learning-suggestions";

export async function refreshCampaignSuggestions(
  clientId: string,
  campaignId: string
) {
  const supabase = await createClient();

  const generated = await generateSuggestionsFromLearnings(clientId, campaignId);

  for (const suggestion of generated) {
    const { data: existing } = await supabase
      .from("suggestions")
      .select("id")
      .eq("client_id", clientId)
      .eq("text", suggestion.description)
      .limit(1);

    if (!existing || existing.length === 0) {
      await supabase.from("suggestions").insert({
        client_id: clientId,
        text: suggestion.description,
        priority: suggestion.priority,
        source: "system",
      });
    }
  }

  revalidatePath(`/app/clients/${clientId}`);
  revalidatePath(`/app/clients/${clientId}/campaigns/${campaignId}`);
  revalidatePath("/app/dashboard");
}
