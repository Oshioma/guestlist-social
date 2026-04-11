"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "../../../lib/supabase/server";

export async function addVideoIdeaAction(
  clientId: string,
  month: string,
  idea: string
) {
  if (!clientId || !month || !idea.trim()) {
    throw new Error("Client, month, and idea text are required.");
  }

  const supabase = await createClient();

  const { error } = await supabase.from("video_ideas").insert({
    client_id: clientId,
    month,
    idea: idea.trim(),
  });

  if (error) {
    console.error("addVideoIdeaAction error:", error);
    throw new Error("Could not add video idea.");
  }

  revalidatePath("/app/video-ideas");
  revalidatePath("/app/content");
}

export async function updateVideoIdeaAction(id: string, idea: string) {
  if (!id || !idea.trim()) {
    throw new Error("ID and idea text are required.");
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("video_ideas")
    .update({ idea: idea.trim(), updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    console.error("updateVideoIdeaAction error:", error);
    throw new Error("Could not update video idea.");
  }

  revalidatePath("/app/video-ideas");
  revalidatePath("/app/content");
}

export async function deleteVideoIdeaAction(id: string) {
  if (!id) {
    throw new Error("ID is required.");
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("video_ideas")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("deleteVideoIdeaAction error:", error);
    throw new Error("Could not delete video idea.");
  }

  revalidatePath("/app/video-ideas");
  revalidatePath("/app/content");
}
