"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "../../../lib/supabase/server";

type RuleKind = "pause" | "scale" | "creative" | "review";

function buildRuleSignature(adId: string, rule: string) {
  return `[AUTO:${rule}:${adId}]`;
}

async function createActionIfMissing(args: {
  clientId: string;
  title: string;
  kind: RuleKind;
  priority: "low" | "medium" | "high";
  notesSignature: string;
}) {
  const supabase = await createClient();

  const { data: existing, error: existingError } = await supabase
    .from("actions")
    .select("id,title")
    .eq("client_id", args.clientId);

  if (existingError) {
    console.error("createActionIfMissing lookup error:", existingError);
    throw new Error("Could not check existing actions.");
  }

  const alreadyExists = (existing ?? []).some((row) =>
    String(row.title ?? "").includes(args.notesSignature)
  );

  if (alreadyExists) {
    return;
  }

  const { error } = await supabase.from("actions").insert({
    client_id: args.clientId,
    title: args.title,
    kind: args.kind,
    priority: args.priority,
    is_complete: false,
  });

  if (error) {
    console.error("createActionIfMissing insert error:", error);
    throw new Error("Could not create action.");
  }
}

export async function generateCampaignActions(
  clientId: string,
  campaignId: string
) {
  const supabase = await createClient();

  const { data: ads, error } = await supabase
    .from("ads")
    .select("*")
    .eq("client_id", clientId)
    .eq("campaign_id", campaignId);

  if (error) {
    console.error("generateCampaignActions ads error:", error);
    throw new Error("Could not load campaign ads.");
  }

  const rows = ads ?? [];

  for (const ad of rows) {
    const adId = String(ad.id);
    const adName = String(ad.name ?? "Untitled ad");
    const spend = Number(ad.spend ?? 0);
    const impressions = Number(ad.impressions ?? 0);
    const clicks = Number(ad.clicks ?? 0);
    const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;

    if (spend >= 5 && ctr > 0 && ctr < 1.0) {
      await createActionIfMissing({
        clientId,
        title: `Review weak ad: ${adName} ${buildRuleSignature(adId, "weak-ctr")}`,
        kind: "creative",
        priority: "high",
        notesSignature: buildRuleSignature(adId, "weak-ctr"),
      });
    }

    if (ctr >= 2.5 && spend >= 3) {
      await createActionIfMissing({
        clientId,
        title: `Consider scaling winner: ${adName} ${buildRuleSignature(adId, "scale")}`,
        kind: "scale",
        priority: "medium",
        notesSignature: buildRuleSignature(adId, "scale"),
      });
    }

    if (spend >= 8 && clicks <= 2) {
      await createActionIfMissing({
        clientId,
        title: `Pause underperforming ad: ${adName} ${buildRuleSignature(adId, "pause")}`,
        kind: "pause",
        priority: "high",
        notesSignature: buildRuleSignature(adId, "pause"),
      });
    }

    if (spend === 0 && impressions === 0) {
      await createActionIfMissing({
        clientId,
        title: `Check delivery/setup: ${adName} ${buildRuleSignature(adId, "delivery")}`,
        kind: "review",
        priority: "low",
        notesSignature: buildRuleSignature(adId, "delivery"),
      });
    }
  }

  revalidatePath(`/app/clients/${clientId}`);
  revalidatePath(`/app/clients/${clientId}/campaigns/${campaignId}`);
  revalidatePath("/app/dashboard");
}
