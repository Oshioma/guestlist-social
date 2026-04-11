"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "../../../lib/supabase/server";

type Priority = "low" | "medium" | "high";
type Kind = "pause" | "scale" | "creative" | "review";

function inferKind(title: string, description: string): Kind {
  const text = `${title} ${description}`.toLowerCase();

  if (text.includes("pause")) return "pause";
  if (text.includes("scale")) return "scale";
  if (text.includes("creative") || text.includes("image") || text.includes("headline")) {
    return "creative";
  }

  return "review";
}

export async function createActionFromSuggestion(args: {
  clientId: string;
  campaignId: string;
  title: string;
  description: string;
  priority: Priority;
}) {
  const supabase = await createClient();

  const normalizedTitle = args.title.trim();
  const normalizedDescription = args.description.trim();
  const signature = `[SUGGESTION:${args.campaignId}:${normalizedTitle}]`;

  const { data: existing, error: existingError } = await supabase
    .from("actions")
    .select("id,title,status")
    .eq("client_id", args.clientId);

  if (existingError) {
    console.error("createActionFromSuggestion lookup error:", existingError);
    throw new Error("Could not check existing actions.");
  }

  const alreadyExists = (existing ?? []).some((row) =>
    String(row.title ?? "").includes(signature)
  );

  if (alreadyExists) {
    revalidatePath(`/app/clients/${args.clientId}/campaigns/${args.campaignId}`);
    return;
  }

  const { error } = await supabase.from("actions").insert({
    client_id: args.clientId,
    title: `${normalizedTitle} ${signature}`,
    kind: inferKind(normalizedTitle, normalizedDescription),
    priority: args.priority,
    status: "open",
    is_complete: false,
    work_note: normalizedDescription || null,
  });

  if (error) {
    console.error("createActionFromSuggestion insert error:", error);
    throw new Error("Could not create action from suggestion.");
  }

  revalidatePath(`/app/clients/${args.clientId}`);
  revalidatePath(`/app/clients/${args.clientId}/campaigns/${args.campaignId}`);
  revalidatePath("/app/dashboard");
}
