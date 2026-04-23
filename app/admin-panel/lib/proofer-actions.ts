"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "../../../lib/supabase/server";

const VALID_STATUSES = [
  "none",
  "improve",
  "check",
  "proofed",
  "approved",
] as const;

type Status = (typeof VALID_STATUSES)[number];

const VALID_PLATFORMS = [
  "instagram_feed",
  "instagram_story",
  "instagram_reel",
  "facebook",
] as const;
type Platform = (typeof VALID_PLATFORMS)[number];

function normalizePlatform(value: string | undefined | null): Platform {
  return value && (VALID_PLATFORMS as readonly string[]).includes(value)
    ? (value as Platform)
    : "instagram_feed";
}

function normalizeMediaUrls(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
}

function parseDateKey(value: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!year || !month || !day || month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }
  return { year, month, day };
}

function buildDateKey(year: number, month: number, day: number): string | null {
  if (!year || !month || !day) return null;
  const maxDay = new Date(year, month, 0).getDate();
  if (day > maxDay) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function buildForwardDateKeys(sourceDate: string, monthValues: string[]): string[] {
  const parsed = parseDateKey(sourceDate);
  if (!parsed) return [];
  const sourceMonth = `${parsed.year}-${String(parsed.month).padStart(2, "0")}`;

  const uniqueFutureMonths = Array.from(
    new Set(
      monthValues
        .map((value) => value.trim())
        .filter((value) => /^\d{4}-\d{2}$/.test(value))
        .filter((value) => value > sourceMonth)
    )
  ).sort();

  const targets: string[] = [];
  for (const monthValue of uniqueFutureMonths) {
    const [yearStr, monthStr] = monthValue.split("-");
    const year = Number(yearStr);
    const month = Number(monthStr);
    const dateKey = buildDateKey(year, month, parsed.day);
    if (dateKey) targets.push(dateKey);
  }
  return targets;
}

function isPlaceholderPostRow(row: {
  caption: string | null;
  media_urls: unknown;
  status: string | null;
  pillar_id: string | null;
  linked_idea_id: string | null;
  linked_idea_kind: string | null;
}): boolean {
  const caption = (row.caption ?? "").trim();
  const hasMedia = Array.isArray(row.media_urls) && row.media_urls.length > 0;
  const status = normalizeStatus(row.status ?? "none");
  return (
    caption.length === 0 &&
    !hasMedia &&
    status === "none" &&
    !row.pillar_id &&
    !row.linked_idea_id &&
    !row.linked_idea_kind
  );
}

const VALID_QUEUE_PLATFORMS = ["instagram", "facebook"] as const;
type QueuePlatform = (typeof VALID_QUEUE_PLATFORMS)[number];

const VALID_QUEUE_STATUSES = [
  "queued",
  "scheduled",
  "published",
  "failed",
] as const;
type QueueStatus = (typeof VALID_QUEUE_STATUSES)[number];

function normalizeStatus(value: string): Status {
  return (VALID_STATUSES as readonly string[]).includes(value)
    ? (value as Status)
    : "none";
}

function normalizeQueuePlatform(value: string): QueuePlatform {
  return (VALID_QUEUE_PLATFORMS as readonly string[]).includes(value)
    ? (value as QueuePlatform)
    : "instagram";
}

function normalizeQueueStatus(value: string): QueueStatus {
  return (VALID_QUEUE_STATUSES as readonly string[]).includes(value)
    ? (value as QueueStatus)
    : "queued";
}

async function getCurrentUserEmail() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user?.email ?? "unknown";
}

function revalidateProoferPaths() {
  revalidatePath("/admin-panel/proofer");
  revalidatePath("/admin-panel/proofer/publish");
}

function revalidatePillarConsumers() {
  revalidatePath("/admin-panel/proofer");
  revalidatePath("/admin-panel/proofer/publish");
  revalidatePath("/admin-panel/video-ideas");
  revalidatePath("/admin-panel/carousel-ideas");
  revalidatePath("/admin-panel/story-ideas");
  revalidatePath("/admin-panel/content");
}

// ---------------- PILLARS ----------------

function sanitizeColor(value: string | undefined | null): string {
  const trimmed = (value ?? "").trim();
  return /^#[0-9a-f]{6}$/i.test(trimmed) ? trimmed : "#18181b";
}

export async function createContentPillarAction(
  clientId: string,
  name: string,
  color: string,
  description: string
) {
  if (!clientId) {
    throw new Error("Client is required.");
  }
  const cleanName = name.trim();
  if (!cleanName) {
    throw new Error("Pillar name is required.");
  }

  const supabase = await createClient();
  const authorEmail = await getCurrentUserEmail();

  const { data: existing } = await supabase
    .from("content_pillars")
    .select("sort_order")
    .eq("client_id", clientId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextSortOrder = (existing?.sort_order ?? 0) + 1;

  const { error } = await supabase.from("content_pillars").insert({
    client_id: clientId,
    name: cleanName,
    color: sanitizeColor(color),
    description: description.trim(),
    sort_order: nextSortOrder,
    created_by: authorEmail,
  });

  if (error) {
    console.error("createContentPillarAction error:", error);
    throw new Error("Could not create pillar.");
  }

  revalidatePillarConsumers();
}

export async function updateContentPillarAction(
  pillarId: string,
  name: string,
  color: string,
  description: string
) {
  if (!pillarId) {
    throw new Error("Pillar is required.");
  }
  const cleanName = name.trim();
  if (!cleanName) {
    throw new Error("Pillar name is required.");
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("content_pillars")
    .update({
      name: cleanName,
      color: sanitizeColor(color),
      description: description.trim(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", pillarId);

  if (error) {
    console.error("updateContentPillarAction error:", error);
    throw new Error("Could not update pillar.");
  }

  revalidatePillarConsumers();
}

export async function archiveContentPillarAction(pillarId: string) {
  if (!pillarId) {
    throw new Error("Pillar is required.");
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("content_pillars")
    .update({
      archived: true,
      updated_at: new Date().toISOString(),
    })
    .eq("id", pillarId);

  if (error) {
    console.error("archiveContentPillarAction error:", error);
    throw new Error("Could not archive pillar.");
  }

  revalidatePillarConsumers();
}

const IDEA_KIND_TABLE_FOR_CREATE: Record<
  "video" | "carousel" | "story",
  { table: string; extras: Record<string, unknown> }
> = {
  video: { table: "video_ideas", extras: {} },
  carousel: { table: "carousel_ideas", extras: { captions: [] } },
  story: { table: "story_ideas", extras: {} },
};

export async function createIdeaFromProoferAction(
  clientId: string,
  kindRaw: string,
  pillarId: string | null,
  idea: string,
  notes: string,
  category: string = "general",
  month: string = ""
): Promise<{ id: string; kind: "video" | "carousel" | "story" }> {
  const kind =
    kindRaw === "video" || kindRaw === "carousel" || kindRaw === "story"
      ? kindRaw
      : "video";

  if (!clientId) {
    throw new Error("Client is required.");
  }
  const cleanIdea = idea.trim();
  if (!cleanIdea) {
    throw new Error("Idea text is required.");
  }

  const supabase = await createClient();
  const authorEmail = await getCurrentUserEmail();

  const { table, extras } = IDEA_KIND_TABLE_FOR_CREATE[kind];

  const { data, error } = await supabase
    .from(table)
    .insert({
      client_id: clientId,
      pillar_id: pillarId || null,
      idea: cleanIdea,
      notes: notes.trim(),
      category: category || "general",
      month: month || "",
      created_by: authorEmail,
      ...extras,
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("createIdeaFromProoferAction error:", error);
    throw new Error("Could not create idea.");
  }

  revalidatePillarConsumers();
  return { id: String(data.id), kind };
}

export async function updateIdeaFromProoferAction(
  id: string,
  kindRaw: string,
  idea: string,
  notes: string,
  pillarId: string | null
) {
  const kind =
    kindRaw === "video" || kindRaw === "carousel" || kindRaw === "story"
      ? kindRaw
      : null;

  if (!id || !kind) {
    throw new Error("Idea is required.");
  }
  const cleanIdea = idea.trim();
  if (!cleanIdea) {
    throw new Error("Idea text is required.");
  }

  const supabase = await createClient();
  const table = IDEA_KIND_TABLE_FOR_CREATE[kind].table;

  const { error } = await supabase
    .from(table)
    .update({
      idea: cleanIdea,
      notes: notes.trim(),
      pillar_id: pillarId || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    console.error("updateIdeaFromProoferAction error:", error);
    throw new Error("Could not update idea.");
  }

  revalidatePillarConsumers();
}

export async function setProoferPostPillarAction(
  postId: string,
  pillarId: string | null
) {
  if (!postId) {
    throw new Error("Post is required.");
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("proofer_posts")
    .update({
      pillar_id: pillarId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", postId);

  if (error) {
    console.error("setProoferPostPillarAction error:", error);
    throw new Error("Could not update post pillar.");
  }

  revalidateProoferPaths();
}

// ---------------- POSTS ----------------

const IDEA_KIND_TO_TABLE: Record<"video" | "carousel" | "story", string> = {
  video: "video_ideas",
  carousel: "carousel_ideas",
  story: "story_ideas",
};

function normalizeIdeaKind(
  value: unknown
): "video" | "carousel" | "story" | null {
  return value === "video" || value === "carousel" || value === "story"
    ? value
    : null;
}

async function releaseIdeaFromPost(
  supabase: Awaited<ReturnType<typeof createClient>>,
  postId: string,
  kind: "video" | "carousel" | "story" | null
) {
  // If the caller knows the kind, release only that table. Otherwise sweep
  // all three — used when an idea kind was never recorded.
  const kinds: ("video" | "carousel" | "story")[] = kind
    ? [kind]
    : ["video", "carousel", "story"];
  for (const k of kinds) {
    const { error } = await supabase
      .from(IDEA_KIND_TO_TABLE[k])
      .update({ used_in_post_id: null, updated_at: new Date().toISOString() })
      .eq("used_in_post_id", postId);
    if (error) {
      console.error(`releaseIdeaFromPost ${k} error:`, error);
    }
  }
}

async function bindIdeaToPost(
  supabase: Awaited<ReturnType<typeof createClient>>,
  postId: string,
  ideaId: string,
  kind: "video" | "carousel" | "story"
) {
  const { error } = await supabase
    .from(IDEA_KIND_TO_TABLE[kind])
    .update({
      used_in_post_id: postId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", ideaId);
  if (error) {
    console.error(`bindIdeaToPost ${kind} error:`, error);
    throw new Error("Could not link idea to post.");
  }
}

export async function saveProoferPostAction(
  clientId: string,
  postDate: string,
  platform: string,
  caption: string,
  mediaUrls: string[],
  pillarId: string | null,
  linkedIdeaId: string | null = null,
  linkedIdeaKindRaw: string | null = null,
  publishTime: string = "18:00"
) {
  if (!clientId || !postDate) {
    throw new Error("Client and date are required.");
  }

  const normalizedPlatform = normalizePlatform(platform);
  const normalizedMedia = normalizeMediaUrls(mediaUrls);
  const primaryImageUrl = normalizedMedia[0] ?? "";
  const normalizedPillarId = pillarId && pillarId.trim() ? pillarId : null;
  const normalizedPublishTime = /^\d{2}:\d{2}$/.test(publishTime) ? publishTime : "18:00";
  const normalizedLinkedIdeaKind = normalizeIdeaKind(linkedIdeaKindRaw);
  const normalizedLinkedIdeaId =
    linkedIdeaId && linkedIdeaId.trim() && normalizedLinkedIdeaKind
      ? linkedIdeaId
      : null;

  const supabase = await createClient();
  const authorEmail = await getCurrentUserEmail();

  const { data: existing } = await supabase
    .from("proofer_posts")
    .select("id, created_by, status, linked_idea_id, linked_idea_kind")
    .eq("client_id", clientId)
    .eq("post_date", postDate)
    .eq("platform", normalizedPlatform)
    .maybeSingle();

  const hasContent = Boolean(caption.trim() || normalizedMedia.length > 0);

  if (existing) {
    const nextStatus: Status =
      existing.status && existing.status !== "none"
        ? normalizeStatus(existing.status)
        : hasContent
        ? "check"
        : "none";

    const { error } = await supabase
      .from("proofer_posts")
      .update({
        caption,
        image_url: primaryImageUrl,
        media_urls: normalizedMedia,
        pillar_id: normalizedPillarId,
        publish_time: normalizedPublishTime,
        linked_idea_id: normalizedLinkedIdeaId,
        linked_idea_kind: normalizedLinkedIdeaId
          ? normalizedLinkedIdeaKind
          : null,
        status: nextStatus,
        updated_by: authorEmail,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);

    if (error) {
      console.error("saveProoferPostAction update error:", error);
      throw new Error("Could not save post.");
    }

    const previousIdeaId = existing.linked_idea_id
      ? String(existing.linked_idea_id)
      : null;
    const previousKind = normalizeIdeaKind(existing.linked_idea_kind);

    if (previousIdeaId && previousIdeaId !== normalizedLinkedIdeaId) {
      await releaseIdeaFromPost(supabase, String(existing.id), previousKind);
    }

    if (normalizedLinkedIdeaId && normalizedLinkedIdeaKind) {
      await bindIdeaToPost(
        supabase,
        String(existing.id),
        normalizedLinkedIdeaId,
        normalizedLinkedIdeaKind
      );
    }
  } else {
    if (!hasContent) {
      return;
    }

    const { data: inserted, error } = await supabase
      .from("proofer_posts")
      .insert({
        client_id: clientId,
        post_date: postDate,
        platform: normalizedPlatform,
        caption,
        image_url: primaryImageUrl,
        media_urls: normalizedMedia,
        pillar_id: normalizedPillarId,
        publish_time: normalizedPublishTime,
        linked_idea_id: normalizedLinkedIdeaId,
        linked_idea_kind: normalizedLinkedIdeaId
          ? normalizedLinkedIdeaKind
          : null,
        status: "check",
        created_by: authorEmail,
      })
      .select("id")
      .single();

    if (error || !inserted) {
      console.error("saveProoferPostAction insert error:", error);
      throw new Error("Could not save post.");
    }

    if (normalizedLinkedIdeaId && normalizedLinkedIdeaKind) {
      await bindIdeaToPost(
        supabase,
        String(inserted.id),
        normalizedLinkedIdeaId,
        normalizedLinkedIdeaKind
      );
    }
  }

  revalidatePillarConsumers();
}

export async function updateProoferStatusAction(
  clientId: string,
  postDate: string,
  platform: string,
  status: string
) {
  if (!clientId || !postDate) {
    throw new Error("Client and date are required.");
  }

  const normalized = normalizeStatus(status);
  const normalizedPlatform = normalizePlatform(platform);
  const supabase = await createClient();
  const authorEmail = await getCurrentUserEmail();

  const { data: existing } = await supabase
    .from("proofer_posts")
    .select("id")
    .eq("client_id", clientId)
    .eq("post_date", postDate)
    .eq("platform", normalizedPlatform)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("proofer_posts")
      .update({
        status: normalized,
        updated_by: authorEmail,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);

    if (error) {
      console.error("updateProoferStatusAction update error:", error);
      throw new Error("Could not update status.");
    }

    // Marking a post as "improve" or "check" removes it from the publish queue
    if (normalized === "improve" || normalized === "check") {
      await supabase.from("proofer_publish_queue").delete().eq("post_id", existing.id);
    }
  } else {
    const { error } = await supabase.from("proofer_posts").insert({
      client_id: clientId,
      post_date: postDate,
      platform: normalizedPlatform,
      caption: "",
      image_url: "",
      media_urls: [],
      status: normalized,
      created_by: authorEmail,
    });

    if (error) {
      console.error("updateProoferStatusAction insert error:", error);
      throw new Error("Could not update status.");
    }
  }

  revalidateProoferPaths();
}

export async function propagateProoferPlatformForwardAction(
  clientId: string,
  sourceDate: string,
  platform: string,
  monthValues: string[]
) {
  if (!clientId) {
    throw new Error("Client is required.");
  }

  const normalizedPlatform = normalizePlatform(platform);
  const targetDates = buildForwardDateKeys(sourceDate, monthValues);
  if (targetDates.length === 0) {
    return;
  }

  const supabase = await createClient();
  const authorEmail = await getCurrentUserEmail();

  const { data: existingRows, error: existingError } = await supabase
    .from("proofer_posts")
    .select(
      "id, post_date, platform, caption, media_urls, status, pillar_id, linked_idea_id, linked_idea_kind"
    )
    .eq("client_id", clientId)
    .in("post_date", targetDates);

  if (existingError) {
    console.error("propagateProoferPlatformForwardAction lookup error:", existingError);
    throw new Error("Could not update future platform settings.");
  }

  const existingRowsSafe = existingRows ?? [];
  const existingOnTargetPlatform = new Set<string>();
  const conflictingPlaceholderIds: string[] = [];

  for (const row of existingRowsSafe) {
    if (row.platform === normalizedPlatform) {
      existingOnTargetPlatform.add(row.post_date ?? "");
      continue;
    }
    if (
      row.id &&
      isPlaceholderPostRow({
        caption: row.caption ?? "",
        media_urls: row.media_urls,
        status: row.status ?? "none",
        pillar_id: row.pillar_id ? String(row.pillar_id) : null,
        linked_idea_id: row.linked_idea_id ? String(row.linked_idea_id) : null,
        linked_idea_kind: row.linked_idea_kind ?? null,
      })
    ) {
      conflictingPlaceholderIds.push(String(row.id));
    }
  }

  if (conflictingPlaceholderIds.length > 0) {
    const { error: deleteError } = await supabase
      .from("proofer_posts")
      .delete()
      .in("id", conflictingPlaceholderIds);
    if (deleteError) {
      console.error(
        "propagateProoferPlatformForwardAction cleanup error:",
        deleteError
      );
      throw new Error("Could not update future platform settings.");
    }
  }

  const insertPayload = targetDates
    .filter((dateKey) => !existingOnTargetPlatform.has(dateKey))
    .map((dateKey) => ({
      client_id: clientId,
      post_date: dateKey,
      platform: normalizedPlatform,
      caption: "",
      image_url: "",
      media_urls: [],
      status: "none",
      pillar_id: null,
      publish_time: "18:00",
      created_by: authorEmail,
    }));

  if (insertPayload.length > 0) {
    const { error: insertError } = await supabase
      .from("proofer_posts")
      .upsert(insertPayload, {
        onConflict: "client_id,post_date,platform",
        ignoreDuplicates: true,
      });
    if (insertError) {
      console.error("propagateProoferPlatformForwardAction insert error:", insertError);
      throw new Error("Could not update future platform settings.");
    }
  }

  revalidateProoferPaths();
}

export async function propagateProoferPillarForwardAction(
  clientId: string,
  sourceDate: string,
  platform: string,
  pillarId: string | null,
  monthValues: string[]
) {
  if (!clientId) {
    throw new Error("Client is required.");
  }

  const normalizedPlatform = normalizePlatform(platform);
  const normalizedPillarId = pillarId && pillarId.trim() ? pillarId : null;
  const targetDates = buildForwardDateKeys(sourceDate, monthValues);
  if (targetDates.length === 0) {
    return;
  }

  const supabase = await createClient();
  const authorEmail = await getCurrentUserEmail();

  const { data: existingRows, error: existingError } = await supabase
    .from("proofer_posts")
    .select(
      "id, post_date, caption, media_urls, status, pillar_id, linked_idea_id, linked_idea_kind"
    )
    .eq("client_id", clientId)
    .eq("platform", normalizedPlatform)
    .in("post_date", targetDates);

  if (existingError) {
    console.error("propagateProoferPillarForwardAction lookup error:", existingError);
    throw new Error("Could not update future pillar settings.");
  }

  const existingRowsSafe = existingRows ?? [];
  const existingIds = existingRowsSafe
    .map((row) => (row.id ? String(row.id) : null))
    .filter((id): id is string => Boolean(id));

  if (existingIds.length > 0) {
    const { error: updateError } = await supabase
      .from("proofer_posts")
      .update({
        pillar_id: normalizedPillarId,
        updated_by: authorEmail,
        updated_at: new Date().toISOString(),
      })
      .in("id", existingIds);
    if (updateError) {
      console.error("propagateProoferPillarForwardAction update error:", updateError);
      throw new Error("Could not update future pillar settings.");
    }
  }

  if (normalizedPillarId) {
    const existingDates = new Set(
      existingRowsSafe.map((row) => row.post_date ?? "").filter(Boolean)
    );
    const insertPayload = targetDates
      .filter((dateKey) => !existingDates.has(dateKey))
      .map((dateKey) => ({
        client_id: clientId,
        post_date: dateKey,
        platform: normalizedPlatform,
        caption: "",
        image_url: "",
        media_urls: [],
        status: "none",
        pillar_id: normalizedPillarId,
        publish_time: "18:00",
        created_by: authorEmail,
      }));

    if (insertPayload.length > 0) {
      const { error: insertError } = await supabase
        .from("proofer_posts")
        .upsert(insertPayload, {
          onConflict: "client_id,post_date,platform",
          ignoreDuplicates: true,
        });
      if (insertError) {
        console.error("propagateProoferPillarForwardAction insert error:", insertError);
        throw new Error("Could not update future pillar settings.");
      }
    }
  } else if (existingRowsSafe.length > 0) {
    const deletableIds = existingRowsSafe
      .filter((row) =>
        isPlaceholderPostRow({
          caption: row.caption ?? "",
          media_urls: row.media_urls,
          status: row.status ?? "none",
          pillar_id: null,
          linked_idea_id: row.linked_idea_id ? String(row.linked_idea_id) : null,
          linked_idea_kind: row.linked_idea_kind ?? null,
        })
      )
      .map((row) => String(row.id));

    if (deletableIds.length > 0) {
      const { error: deleteError } = await supabase
        .from("proofer_posts")
        .delete()
        .in("id", deletableIds);
      if (deleteError) {
        console.error("propagateProoferPillarForwardAction delete error:", deleteError);
        throw new Error("Could not update future pillar settings.");
      }
    }
  }

  revalidateProoferPaths();
}

export async function deleteProoferPostAction(
  clientId: string,
  postDate: string,
  platform: string
) {
  if (!clientId || !postDate) {
    throw new Error("Client and date are required.");
  }

  const normalizedPlatform = normalizePlatform(platform);
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("proofer_posts")
    .select("id, linked_idea_id, linked_idea_kind")
    .eq("client_id", clientId)
    .eq("post_date", postDate)
    .eq("platform", normalizedPlatform)
    .maybeSingle();

  if (existing?.id) {
    await releaseIdeaFromPost(
      supabase,
      String(existing.id),
      normalizeIdeaKind(existing.linked_idea_kind)
    );
  }

  const { error } = await supabase
    .from("proofer_posts")
    .delete()
    .eq("client_id", clientId)
    .eq("post_date", postDate)
    .eq("platform", normalizedPlatform);

  if (error) {
    console.error("deleteProoferPostAction error:", error);
    throw new Error("Could not delete post.");
  }

  revalidatePillarConsumers();
}

// ---------------- COMMENTS ----------------

export async function addProoferCommentAction(postId: string, comment: string) {
  if (!postId) {
    throw new Error("Post is required.");
  }

  const cleanComment = comment.trim();
  if (!cleanComment) {
    throw new Error("Comment is required.");
  }

  const supabase = await createClient();
  const authorEmail = await getCurrentUserEmail();

  const { error } = await supabase.from("proofer_comments").insert({
    post_id: postId,
    comment: cleanComment,
    created_by: authorEmail,
    resolved: false,
  });

  if (error) {
    console.error("addProoferCommentAction error:", error);
    throw new Error("Could not add comment.");
  }

  revalidateProoferPaths();
}

export async function toggleProoferCommentResolvedAction(
  commentId: string,
  resolved: boolean
) {
  if (!commentId) {
    throw new Error("Comment is required.");
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("proofer_comments")
    .update({ resolved })
    .eq("id", commentId);

  if (error) {
    console.error("toggleProoferCommentResolvedAction error:", error);
    throw new Error("Could not update comment.");
  }

  revalidateProoferPaths();
}

// ---------------- PUBLISH QUEUE ----------------

export async function queueProoferPostAction(
  postId: string,
  platform: string
) {
  if (!postId) {
    throw new Error("Post is required.");
  }

  const normalizedPlatform = normalizeQueuePlatform(platform);
  const supabase = await createClient();
  const authorEmail = await getCurrentUserEmail();

  const { data: post, error: postError } = await supabase
    .from("proofer_posts")
    .select("id, status")
    .eq("id", postId)
    .maybeSingle();

  if (postError) {
    console.error("queueProoferPostAction post lookup error:", postError);
    throw new Error("Could not verify post.");
  }

  if (!post) {
    throw new Error("Post not found.");
  }

  if (post.status !== "proofed" && post.status !== "approved") {
    throw new Error("Only proofed posts can be added to the publish queue.");
  }

  const { error } = await supabase.from("proofer_publish_queue").upsert(
    {
      post_id: postId,
      platform: normalizedPlatform,
      status: "queued",
      created_by: authorEmail,
      updated_at: new Date().toISOString(),
    },
    {
      onConflict: "post_id,platform",
      ignoreDuplicates: false,
    }
  );

  if (error) {
    console.error("queueProoferPostAction upsert error:", error);
    throw new Error("Could not add post to publish queue.");
  }

  revalidateProoferPaths();
}

export async function scheduleProoferQueueItemAction(
  queueId: string,
  scheduledFor: string
) {
  if (!queueId) {
    throw new Error("Queue item is required.");
  }

  if (!scheduledFor) {
    throw new Error("Scheduled time is required.");
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("proofer_publish_queue")
    .update({
      status: "scheduled",
      scheduled_for: scheduledFor,
      updated_at: new Date().toISOString(),
    })
    .eq("id", queueId);

  if (error) {
    console.error("scheduleProoferQueueItemAction error:", error);
    throw new Error("Could not schedule queue item.");
  }

  revalidateProoferPaths();
}

export async function markProoferQueueItemPublishedAction(
  queueId: string,
  publishUrl?: string
) {
  if (!queueId) {
    throw new Error("Queue item is required.");
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("proofer_publish_queue")
    .update({
      status: "published",
      published_at: new Date().toISOString(),
      publish_url: publishUrl?.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", queueId);

  if (error) {
    console.error("markProoferQueueItemPublishedAction error:", error);
    throw new Error("Could not mark queue item as published.");
  }

  revalidateProoferPaths();
}

export async function markProoferQueueItemFailedAction(
  queueId: string,
  notes?: string
) {
  if (!queueId) {
    throw new Error("Queue item is required.");
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("proofer_publish_queue")
    .update({
      status: "failed",
      notes: notes?.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", queueId);

  if (error) {
    console.error("markProoferQueueItemFailedAction error:", error);
    throw new Error("Could not mark queue item as failed.");
  }

  revalidateProoferPaths();
}

export async function removeProoferQueueItemAction(queueId: string) {
  if (!queueId) {
    throw new Error("Queue item is required.");
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("proofer_publish_queue")
    .delete()
    .eq("id", queueId);

  if (error) {
    console.error("removeProoferQueueItemAction error:", error);
    throw new Error("Could not remove queue item.");
  }

  revalidateProoferPaths();
}

export async function updateProoferQueueItemStatusAction(
  queueId: string,
  status: string
) {
  if (!queueId) {
    throw new Error("Queue item is required.");
  }

  const normalizedStatus = normalizeQueueStatus(status);
  const supabase = await createClient();

  const updatePayload: {
    status: QueueStatus;
    updated_at: string;
    published_at?: string | null;
  } = {
    status: normalizedStatus,
    updated_at: new Date().toISOString(),
  };

  if (normalizedStatus === "published") {
    updatePayload.published_at = new Date().toISOString();
  }

  const { error } = await supabase
    .from("proofer_publish_queue")
    .update(updatePayload)
    .eq("id", queueId);

  if (error) {
    console.error("updateProoferQueueItemStatusAction error:", error);
    throw new Error("Could not update queue item status.");
  }

  revalidateProoferPaths();
}

export async function deleteProoferPostByIdAction(postId: string) {
  if (!postId) {
    throw new Error("Post ID is required.");
  }

  const supabase = await createClient();

  await supabase
    .from("proofer_publish_queue")
    .delete()
    .eq("post_id", postId);

  await supabase
    .from("proofer_comments")
    .delete()
    .eq("post_id", postId);

  const { error } = await supabase
    .from("proofer_posts")
    .delete()
    .eq("id", postId);

  if (error) {
    console.error("deleteProoferPostByIdAction error:", error);
    throw new Error("Could not delete post.");
  }

  revalidateProoferPaths();
}

// ── Post ideas (AI suggestions) ──────────────────────────────────────────────

export async function rejectPostIdeaAction(ideaId: string) {
  if (!ideaId) throw new Error("Idea ID is required.");
  const supabase = await createClient();
  const { error } = await supabase
    .from("post_ideas")
    .update({ status: "rejected", updated_at: new Date().toISOString() })
    .eq("id", ideaId);
  if (error) throw new Error("Could not reject idea.");
  revalidateProoferPaths();
}

export async function markIdeaWeakAction(ideaId: string, isWeak: boolean) {
  if (!ideaId) throw new Error("Idea ID is required.");
  const supabase = await createClient();
  const { error } = await supabase
    .from("post_ideas")
    .update({ is_weak: isWeak, updated_at: new Date().toISOString() })
    .eq("id", ideaId);
  if (error) throw new Error("Could not update idea.");
  revalidateProoferPaths();
}

export async function clearPostIdeasAction(clientId: string, month: string, platform: string) {
  if (!clientId || !month) throw new Error("clientId and month required.");
  const supabase = await createClient();
  const [yearStr, monthStr] = month.split("-");
  const year = Number(yearStr);
  const m = Number(monthStr);
  const start = `${yearStr}-${monthStr}-01`;
  const nextMonth = new Date(year, m, 1);
  const end = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, "0")}-01`;
  const { error } = await supabase
    .from("post_ideas")
    .delete()
    .eq("client_id", clientId)
    .eq("platform", platform)
    .gte("post_slot_date", start)
    .lt("post_slot_date", end)
    .neq("status", "promoted"); // never delete ideas already linked to a real post
  if (error) throw new Error("Could not clear ideas.");
  revalidateProoferPaths();
}

export async function updatePostIdeaFieldAction(
  ideaId: string,
  field: "caption_idea" | "image_idea" | "cta" | "first_line" | "hashtags" | "title",
  value: string
) {
  if (!ideaId) throw new Error("Idea ID is required.");
  const supabase = await createClient();
  const { error } = await supabase
    .from("post_ideas")
    .update({ [field]: value, updated_at: new Date().toISOString() })
    .eq("id", ideaId);
  if (error) throw new Error("Could not update idea field.");
  revalidateProoferPaths();
}
