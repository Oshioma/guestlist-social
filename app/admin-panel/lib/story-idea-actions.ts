"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "../../../lib/supabase/server";

// ── Theme actions ──

export async function addStoryThemeAction(
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

  const { error } = await supabase.from("story_themes").insert({
    client_id: clientId,
    month_label: monthLabel.trim(),
    theme: theme.trim(),
    goal: goal.trim(),
    notes: notes.trim(),
    sort_order: sortOrder,
  });

  if (error) {
    console.error("addStoryThemeAction error:", error);
    throw new Error("Could not add theme.");
  }

  revalidatePath("/app/story-ideas");
  revalidatePath("/app/content");
}

export async function updateStoryThemeAction(
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
    .from("story_themes")
    .update({
      month_label: monthLabel.trim(),
      theme: theme.trim(),
      goal: goal.trim(),
      notes: notes.trim(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    console.error("updateStoryThemeAction error:", error);
    throw new Error("Could not update theme.");
  }

  revalidatePath("/app/story-ideas");
  revalidatePath("/app/content");
}

export async function deleteStoryThemeAction(id: string) {
  if (!id) throw new Error("ID is required.");

  const supabase = await createClient();

  await supabase.from("story_ideas").delete().eq("theme_id", id);

  const { error } = await supabase
    .from("story_themes")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("deleteStoryThemeAction error:", error);
    throw new Error("Could not delete theme.");
  }

  revalidatePath("/app/story-ideas");
  revalidatePath("/app/content");
}

// ── Idea actions ──

export async function addStoryIdeaAction(
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

  const { error } = await supabase.from("story_ideas").insert({
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
    console.error("addStoryIdeaAction error:", error);
    throw new Error("Could not add idea.");
  }

  revalidatePath("/app/story-ideas");
  revalidatePath("/app/content");
  revalidatePath("/app/proofer");
}

export async function updateStoryIdeaAction(
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
    .from("story_ideas")
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
    console.error("updateStoryIdeaAction error:", error);
    throw new Error("Could not update idea.");
  }

  revalidatePath("/app/story-ideas");
  revalidatePath("/app/content");
  revalidatePath("/app/proofer");
}

export async function setStoryIdeaPillarAction(
  id: string,
  pillarId: string | null
) {
  if (!id) throw new Error("ID is required.");
  const supabase = await createClient();
  const { error } = await supabase
    .from("story_ideas")
    .update({
      pillar_id: pillarId || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) {
    console.error("setStoryIdeaPillarAction error:", error);
    throw new Error("Could not update pillar.");
  }
  revalidatePath("/app/story-ideas");
  revalidatePath("/app/content");
  revalidatePath("/app/proofer");
}

export async function updateStoryDesignLinkAction(id: string, designLink: string) {
  if (!id) throw new Error("ID is required.");
  const supabase = await createClient();
  const { error } = await supabase
    .from("story_ideas")
    .update({ design_link: designLink.trim(), updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) {
    console.error("updateStoryDesignLinkAction error:", error);
    throw new Error("Could not update design link.");
  }
  revalidatePath("/app/story-ideas");
}

export async function deleteStoryIdeaAction(id: string) {
  if (!id) throw new Error("ID is required.");

  const supabase = await createClient();

  const { error } = await supabase
    .from("story_ideas")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("deleteStoryIdeaAction error:", error);
    throw new Error("Could not delete idea.");
  }

  revalidatePath("/app/story-ideas");
  revalidatePath("/app/content");
}
