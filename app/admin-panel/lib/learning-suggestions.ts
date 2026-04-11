"use server";

import { createClient } from "../../../lib/supabase/server";

type SuggestedAction = {
  title: string;
  description: string;
  priority: "low" | "medium" | "high";
  basedOnLearningId?: string;
};

function normalize(text: string) {
  return text.toLowerCase().trim();
}

function scoreLearningMatch(args: {
  adName: string;
  audience: string;
  notes: string;
  learningProblem: string;
  learningChangeMade: string;
  learningOutcome: string;
}) {
  let score = 0;

  const haystack = normalize(
    `${args.adName} ${args.audience} ${args.notes}`
  );
  const problem = normalize(args.learningProblem);
  const change = normalize(args.learningChangeMade);
  const outcome = normalize(args.learningOutcome);

  if (problem && haystack.includes(problem)) score += 4;

  const changeWords = change.split(" ").filter((w) => w.length > 4);
  for (const word of changeWords) {
    if (haystack.includes(word)) score += 1;
  }

  if (outcome.includes("winner")) score += 2;
  if (outcome.includes("improved")) score += 2;
  if (outcome.includes("better ctr")) score += 2;

  return score;
}

export async function generateSuggestionsFromLearnings(
  clientId: string,
  campaignId: string
): Promise<SuggestedAction[]> {
  const supabase = await createClient();

  const [{ data: ads, error: adsError }, { data: learnings, error: learningsError }] =
    await Promise.all([
      supabase
        .from("ads")
        .select("*")
        .eq("client_id", clientId)
        .eq("campaign_id", campaignId),
      supabase
        .from("learnings")
        .select("*")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false }),
    ]);

  if (adsError) {
    console.error("generateSuggestionsFromLearnings ads error:", adsError);
    throw new Error("Could not load ads.");
  }

  if (learningsError) {
    console.error("generateSuggestionsFromLearnings learnings error:", learningsError);
    throw new Error("Could not load learnings.");
  }

  const adRows = ads ?? [];
  const learningRows = learnings ?? [];

  const suggestions: SuggestedAction[] = [];

  for (const ad of adRows) {
    const adName = String(ad.name ?? "");
    const audience = String(ad.audience ?? "");
    const notes = String(ad.notes ?? "");
    const spend = Number(ad.spend ?? 0);
    const impressions = Number(ad.impressions ?? 0);
    const clicks = Number(ad.clicks ?? 0);
    const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;

    const lowPerformance = spend >= 5 && ctr > 0 && ctr < 1.5;
    if (!lowPerformance) continue;

    let bestLearning: { id: string; change_made: string; outcome: string; result: string } | null = null;
    let bestScore = 0;

    for (const learning of learningRows) {
      const score = scoreLearningMatch({
        adName,
        audience,
        notes,
        learningProblem: String(learning.problem ?? ""),
        learningChangeMade: String(learning.change_made ?? ""),
        learningOutcome: String(learning.outcome ?? ""),
      });

      if (score > bestScore) {
        bestScore = score;
        bestLearning = learning;
      }
    }

    if (bestLearning && bestScore >= 3) {
      suggestions.push({
        title: `Try a proven fix for ${adName}`,
        description: `Past learning suggests: ${bestLearning.change_made}. Previous outcome: ${bestLearning.outcome ?? bestLearning.result ?? "improved performance"}.`,
        priority: "high",
        basedOnLearningId: bestLearning.id,
      });
    }
  }

  return suggestions;
}
