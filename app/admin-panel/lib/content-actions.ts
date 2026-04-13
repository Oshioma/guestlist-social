"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "../../../lib/supabase/server";
import type { ContentStatus } from "./types";

const VALID_STATUSES: ContentStatus[] = [
  "not_started",
  "in_progress",
  "proof",
  "complete",
];

export async function updateContentProgressAction(
  clientId: string,
  month: string,
  status: ContentStatus
) {
  if (!clientId || !month) {
    throw new Error("Client ID and month are required.");
  }

  if (!VALID_STATUSES.includes(status)) {
    throw new Error("Invalid content status.");
  }

  const supabase = await createClient();

  // Check if a row already exists for this client + month
  const { data: existing, error: fetchError } = await supabase
    .from("content_progress")
    .select("id")
    .eq("client_id", clientId)
    .eq("month", month)
    .maybeSingle();

  if (fetchError) {
    console.error("updateContentProgressAction fetch error:", fetchError);
    throw new Error("Could not check existing progress.");
  }

  if (existing) {
    const { error } = await supabase
      .from("content_progress")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", existing.id);

    if (error) {
      console.error("updateContentProgressAction update error:", error);
      throw new Error("Could not update content progress.");
    }
  } else {
    const { error } = await supabase.from("content_progress").insert({
      client_id: clientId,
      month,
      status,
    });

    if (error) {
      console.error("updateContentProgressAction insert error:", error);
      throw new Error("Could not create content progress.");
    }
  }

  revalidatePath("/admin-panel/content");
}
