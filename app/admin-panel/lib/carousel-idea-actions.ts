"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "../../../lib/supabase/server";

// ── Theme actions ──

export async function addCarouselThemeAction(
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

  const { error } = await supabase.from("carousel_themes").insert({
    client_id: clientId,
    month_label: monthLabel.trim(),
    theme: theme.trim(),
    goal: goal.trim(),
    notes: notes.trim(),
    sort_order: sortOrder,
  });

  if (error) {
    console.error("addCarouselThemeAction error:", error);
    throw new Error("Could not add theme.");
  }

  revalidatePath("/admin-panel/carousel-ideas");
  revalidatePath("/admin-panel/content");
}

export async function updateCarouselThemeAction(
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
    .from("carousel_themes")
    .update({
      month_label: monthLabel.trim(),
      theme: theme.trim(),
      goal: goal.trim(),
      notes: notes.trim(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    console.error("updateCarouselThemeAction error:", error);
    throw new Error("Could not update theme.");
  }

  revalidatePath("/admin-panel/carousel-ideas");
  revalidatePath("/admin-panel/content");
}

export async function deleteCarouselThemeAction(id: string) {
  if (!id) throw new Error("ID is required.");

  const supabase = await createClient();

  await supabase.from("carousel_ideas").delete().eq("theme_id", id);

  const { error } = await supabase
    .from("carousel_themes")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("deleteCarouselThemeAction error:", error);
    throw new Error("Could not delete theme.");
  }

  revalidatePath("/admin-panel/carousel-ideas");
  revalidatePath("/admin-panel/content");
}

// ── Idea actions ──

export async function addCarouselIdeaAction(
  clientId: string,
  themeId: string | null,
  idea: string,
  category: string,
  month: string = ""
) {
  if (!clientId || !idea.trim()) {
    throw new Error("Client and idea text are required.");
  }

  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  const createdBy = user?.email ?? "unknown";

  const { error } = await supabase.from("carousel_ideas").insert({
    client_id: clientId,
    theme_id: themeId || null,
    idea: idea.trim(),
    category: category || "general",
    month: month || "",
    captions: [],
    created_by: createdBy,
  });

  if (error) {
    console.error("addCarouselIdeaAction error:", error);
    throw new Error("Could not add idea.");
  }

  revalidatePath("/admin-panel/carousel-ideas");
  revalidatePath("/admin-panel/content");
}

export async function updateCarouselIdeaAction(
  id: string,
  idea: string,
  category: string,
  month: string = ""
) {
  if (!id || !idea.trim()) {
    throw new Error("ID and idea text are required.");
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("carousel_ideas")
    .update({
      idea: idea.trim(),
      category: category || "general",
      month: month || "",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    console.error("updateCarouselIdeaAction error:", error);
    throw new Error("Could not update idea.");
  }

  revalidatePath("/admin-panel/carousel-ideas");
  revalidatePath("/admin-panel/content");
}

export async function updateCarouselCaptionsAction(
  id: string,
  captions: string[],
  captionImages: string[] = []
) {
  if (!id) throw new Error("ID is required.");

  const supabase = await createClient();

  const trimmedCaptions = captions.map((c) => c.trim()).slice(0, 8);
  const trimmedImages = captionImages.map((c) => c.trim()).slice(0, 8);

  const { error } = await supabase
    .from("carousel_ideas")
    .update({
      captions: trimmedCaptions,
      caption_images: trimmedImages,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    console.error("updateCarouselCaptionsAction error:", error);
    throw new Error("Could not update captions.");
  }

  revalidatePath("/admin-panel/carousel-ideas");
}

export async function updateCarouselDesignLinkAction(id: string, designLink: string) {
  if (!id) throw new Error("ID is required.");
  const supabase = await createClient();
  const { error } = await supabase
    .from("carousel_ideas")
    .update({ design_link: designLink.trim(), updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) {
    console.error("updateCarouselDesignLinkAction error:", error);
    throw new Error("Could not update design link.");
  }
  revalidatePath("/admin-panel/carousel-ideas");
}

export async function deleteCarouselIdeaAction(id: string) {
  if (!id) throw new Error("ID is required.");

  const supabase = await createClient();

  const { error } = await supabase
    .from("carousel_ideas")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("deleteCarouselIdeaAction error:", error);
    throw new Error("Could not delete idea.");
  }

  revalidatePath("/admin-panel/carousel-ideas");
  revalidatePath("/admin-panel/content");
}
