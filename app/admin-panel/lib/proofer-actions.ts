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
  revalidatePath("/app/proofer");
  revalidatePath("/app/proofer/publish");
}

// ---------------- POSTS ----------------

export async function saveProoferPostAction(
  clientId: string,
  postDate: string,
  caption: string,
  imageUrl: string
) {
  if (!clientId || !postDate) {
    throw new Error("Client and date are required.");
  }

  const supabase = await createClient();
  const authorEmail = await getCurrentUserEmail();

  const { data: existing } = await supabase
    .from("proofer_posts")
    .select("id, created_by, status")
    .eq("client_id", clientId)
    .eq("post_date", postDate)
    .maybeSingle();

  const hasContent = Boolean(caption.trim() || imageUrl.trim());

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
        image_url: imageUrl,
        status: nextStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);

    if (error) {
      console.error("saveProoferPostAction update error:", error);
      throw new Error("Could not save post.");
    }
  } else {
    if (!hasContent) {
      return;
    }

    const { error } = await supabase.from("proofer_posts").insert({
      client_id: clientId,
      post_date: postDate,
      caption,
      image_url: imageUrl,
      status: "check",
      created_by: authorEmail,
    });

    if (error) {
      console.error("saveProoferPostAction insert error:", error);
      throw new Error("Could not save post.");
    }
  }

  revalidateProoferPaths();
}

export async function updateProoferStatusAction(
  clientId: string,
  postDate: string,
  status: string
) {
  if (!clientId || !postDate) {
    throw new Error("Client and date are required.");
  }

  const normalized = normalizeStatus(status);
  const supabase = await createClient();
  const authorEmail = await getCurrentUserEmail();

  const { data: existing } = await supabase
    .from("proofer_posts")
    .select("id")
    .eq("client_id", clientId)
    .eq("post_date", postDate)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("proofer_posts")
      .update({
        status: normalized,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);

    if (error) {
      console.error("updateProoferStatusAction update error:", error);
      throw new Error("Could not update status.");
    }
  } else {
    const { error } = await supabase.from("proofer_posts").insert({
      client_id: clientId,
      post_date: postDate,
      caption: "",
      image_url: "",
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

export async function deleteProoferPostAction(
  clientId: string,
  postDate: string
) {
  if (!clientId || !postDate) {
    throw new Error("Client and date are required.");
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("proofer_posts")
    .delete()
    .eq("client_id", clientId)
    .eq("post_date", postDate);

  if (error) {
    console.error("deleteProoferPostAction error:", error);
    throw new Error("Could not delete post.");
  }

  revalidateProoferPaths();
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

  if (post.status !== "approved") {
    throw new Error("Only approved posts can be added to the publish queue.");
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
