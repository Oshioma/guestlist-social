"use server";

import { createClient } from "../../../lib/supabase/server";

export async function generateSuggestionsFromLearnings(
  clientId: string,
  campaignId: string
) {
  const supabase = await createClient();

  const { data: ads } = await supabase
    .from("ads")
    .select("*")
    .eq("client_id", clientId)
    .eq("campaign_id", campaignId);

  const { data: learnings } = await supabase
    .from("learnings")
    .select("*")
    .eq("client_id", clientId);

  const suggestions: { title: string; description: string; priority: "low" | "medium" | "high" }[] = [];

  for (const ad of ads ?? []) {
    const impressions = Number(ad.impressions ?? 0);
    const clicks = Number(ad.clicks ?? 0);
    const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;

    // Weak ad = suggest past fix
    if (ctr > 0 && ctr < 1.5) {
      for (const learning of learnings ?? []) {
        if (learning.outcome === "positive") {
          suggestions.push({
            title: `Apply proven fix to "${ad.name}"`,
            description: `Previously: ${learning.change_made}`,
            priority: "high",
          });
        }
      }
    }
  }

  return suggestions;
}
