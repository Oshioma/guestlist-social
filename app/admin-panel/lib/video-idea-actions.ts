"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "../../../lib/supabase/server";

// ── Theme actions ──

export async function addThemeAction(
  clientId: string,
  monthLabel: string,
  theme: string,
  goal: string,
  sortOrder: number,
  notes: string = ""
) {
  if (!clientId || !theme.trim()) {
    throw new Error("Client and theme name are required.");
  }

  const supabase = await createClient();

  const { error } = await supabase.from("content_themes").insert({
    client_id: clientId,
    month_label: monthLabel.trim(),
    theme: theme.trim(),
    goal: goal.trim(),
    notes: notes.trim(),
    sort_order: sortOrder,
  });

  if (error) {
    console.error("addThemeAction error:", error);
    throw new Error("Could not add theme.");
  }

  revalidatePath("/admin-panel/video-ideas");
  revalidatePath("/admin-panel/content");
}

export async function updateThemeAction(
  id: string,
  monthLabel: string,
  theme: string,
  goal: string,
  notes: string = ""
) {
  if (!id || !theme.trim()) {
    throw new Error("ID and theme name are required.");
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("content_themes")
    .update({
      month_label: monthLabel.trim(),
      theme: theme.trim(),
      goal: goal.trim(),
      notes: notes.trim(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    console.error("updateThemeAction error:", error);
    throw new Error("Could not update theme.");
  }

  revalidatePath("/admin-panel/video-ideas");
  revalidatePath("/admin-panel/content");
}

export async function deleteThemeAction(id: string) {
  if (!id) throw new Error("ID is required.");

  const supabase = await createClient();

  // Delete ideas linked to this theme first
  await supabase.from("video_ideas").delete().eq("theme_id", id);

  const { error } = await supabase
    .from("content_themes")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("deleteThemeAction error:", error);
    throw new Error("Could not delete theme.");
  }

  revalidatePath("/admin-panel/video-ideas");
  revalidatePath("/admin-panel/content");
}

// ── Idea actions ──

export async function addVideoIdeaAction(
  clientId: string,
  themeId: string | null,
  idea: string,
  category: string,
  month: string = "",
  pillarId: string | null = null,
  notes: string = ""
) {
  if (!clientId || !idea.trim()) {
    throw new Error("Client and idea text are required.");
  }

  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  const createdBy = user?.email ?? "unknown";

  const { error } = await supabase.from("video_ideas").insert({
    client_id: clientId,
    theme_id: themeId || null,
    pillar_id: pillarId || null,
    idea: idea.trim(),
    notes: notes.trim(),
    category: category || "general",
    month: month || "",
    created_by: createdBy,
  });

  if (error) {
    console.error("addVideoIdeaAction error:", error);
    throw new Error("Could not add idea.");
  }

  revalidatePath("/admin-panel/video-ideas");
  revalidatePath("/admin-panel/content");
  revalidatePath("/admin-panel/proofer");
}

export async function updateVideoIdeaAction(
  id: string,
  idea: string,
  category: string,
  month: string = "",
  pillarId: string | null = null,
  notes: string = ""
) {
  if (!id || !idea.trim()) {
    throw new Error("ID and idea text are required.");
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("video_ideas")
    .update({
      idea: idea.trim(),
      notes: notes.trim(),
      category: category || "general",
      month: month || "",
      pillar_id: pillarId || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    console.error("updateVideoIdeaAction error:", error);
    throw new Error("Could not update idea.");
  }

  revalidatePath("/admin-panel/video-ideas");
  revalidatePath("/admin-panel/content");
  revalidatePath("/admin-panel/proofer");
}

export async function setVideoIdeaNotesAction(id: string, notes: string) {
  if (!id) throw new Error("ID is required.");
  const supabase = await createClient();
  const { error } = await supabase
    .from("video_ideas")
    .update({
      notes: notes.trim(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) {
    console.error("setVideoIdeaNotesAction error:", error);
    throw new Error("Could not update notes.");
  }
  revalidatePath("/admin-panel/video-ideas");
  revalidatePath("/admin-panel/content");
  revalidatePath("/admin-panel/proofer");
}

export async function setVideoIdeaPillarAction(
  id: string,
  pillarId: string | null
) {
  if (!id) throw new Error("ID is required.");
  const supabase = await createClient();
  const { error } = await supabase
    .from("video_ideas")
    .update({
      pillar_id: pillarId || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) {
    console.error("setVideoIdeaPillarAction error:", error);
    throw new Error("Could not update pillar.");
  }
  revalidatePath("/admin-panel/video-ideas");
  revalidatePath("/admin-panel/content");
  revalidatePath("/admin-panel/proofer");
}

export async function updateVideoDesignLinkAction(id: string, designLink: string) {
  if (!id) throw new Error("ID is required.");
  const supabase = await createClient();
  const { error } = await supabase
    .from("video_ideas")
    .update({ design_link: designLink.trim(), updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) {
    console.error("updateVideoDesignLinkAction error:", error);
    throw new Error("Could not update design link.");
  }
  revalidatePath("/admin-panel/video-ideas");
}

export async function deleteVideoIdeaAction(id: string) {
  if (!id) throw new Error("ID is required.");

  const supabase = await createClient();

  const { error } = await supabase
    .from("video_ideas")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("deleteVideoIdeaAction error:", error);
    throw new Error("Could not delete idea.");
  }

  revalidatePath("/admin-panel/video-ideas");
  revalidatePath("/admin-panel/content");
}
