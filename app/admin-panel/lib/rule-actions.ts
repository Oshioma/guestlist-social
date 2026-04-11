"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "../../../lib/supabase/server";

type RuleKind = "pause" | "scale" | "creative" | "review";
type ActionStatus = "open" | "in_progress" | "completed";

function buildRuleSignature(adId: string, rule: string) {
  return `[AUTO:${rule}:${adId}]`;
}

async function upsertRuleAction(args: {
  clientId: string;
  title: string;
  kind: RuleKind;
  priority: "low" | "medium" | "high";
  signature: string;
  shouldExist: boolean;
}) {
  const supabase = await createClient();

  const { data: existingRows, error: existingError } = await supabase
    .from("actions")
    .select("id,title,status,is_complete")
    .eq("client_id", args.clientId);

  if (existingError) {
    console.error("upsertRuleAction lookup error:", existingError);
    throw new Error("Could not check existing actions.");
  }

  const existing = (existingRows ?? []).find((row) =>
    String(row.title ?? "").includes(args.signature)
  );

  if (args.shouldExist) {
    if (existing) {
      // If it already exists and was previously completed, reopen it.
      if (existing.status === "completed" || existing.is_complete === true) {
        const { error: reopenError } = await supabase
          .from("actions")
          .update({
            status: "open" satisfies ActionStatus,
            is_complete: false,
          })
          .eq("id", existing.id);

        if (reopenError) {
          console.error("upsertRuleAction reopen error:", reopenError);
          throw new Error("Could not reopen action.");
        }
      }

      return;
    }

    const { error: insertError } = await supabase.from("actions").insert({
      client_id: args.clientId,
      title: args.title,
      kind: args.kind,
      priority: args.priority,
      status: "open" satisfies ActionStatus,
      is_complete: false,
    });

    if (insertError) {
      console.error("upsertRuleAction insert error:", insertError);
      throw new Error("Could not create action.");
    }

    return;
  }

  if (!existing) return;

  // Only auto-complete actions that are still open.
  // If a human has moved it to in_progress, leave it alone.
  if (existing.status === "open" || existing.status == null) {
    const { error: completeError } = await supabase
      .from("actions")
      .update({
        status: "completed" satisfies ActionStatus,
        is_complete: true,
      })
      .eq("id", existing.id);

    if (completeError) {
      console.error("upsertRuleAction complete error:", completeError);
      throw new Error("Could not complete action.");
    }
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

    const weakCtrSignature = buildRuleSignature(adId, "weak-ctr");
    const scaleSignature = buildRuleSignature(adId, "scale");
    const pauseSignature = buildRuleSignature(adId, "pause");
    const deliverySignature = buildRuleSignature(adId, "delivery");

    const weakCtrCondition = spend >= 5 && ctr > 0 && ctr < 1.0;
    const scaleCondition = ctr >= 2.5 && spend >= 3;
    const pauseCondition = spend >= 8 && clicks <= 2;
    const deliveryCondition = spend === 0 && impressions === 0;

    await upsertRuleAction({
      clientId,
      title: `Review weak ad: ${adName} ${weakCtrSignature}`,
      kind: "creative",
      priority: "high",
      signature: weakCtrSignature,
      shouldExist: weakCtrCondition,
    });

    await upsertRuleAction({
      clientId,
      title: `Consider scaling winner: ${adName} ${scaleSignature}`,
      kind: "scale",
      priority: "medium",
      signature: scaleSignature,
      shouldExist: scaleCondition,
    });

    await upsertRuleAction({
      clientId,
      title: `Pause underperforming ad: ${adName} ${pauseSignature}`,
      kind: "pause",
      priority: "high",
      signature: pauseSignature,
      shouldExist: pauseCondition,
    });

    await upsertRuleAction({
      clientId,
      title: `Check delivery/setup: ${adName} ${deliverySignature}`,
      kind: "review",
      priority: "low",
      signature: deliverySignature,
      shouldExist: deliveryCondition,
    });
  }

  revalidatePath(`/app/clients/${clientId}`);
  revalidatePath(`/app/clients/${clientId}/campaigns/${campaignId}`);
  revalidatePath("/app/dashboard");
}
