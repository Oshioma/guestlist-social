"use server";

// ---------------------------------------------------------------------------
// Client-facing proofer actions.
//
// These run on behalf of a *portal* user (a client), who by RLS can only read
// their own proofer rows. Every action therefore:
//   1. resolves the viewer and asserts they may act on this client, then
//   2. writes with the service-role admin client (bypassing RLS) after
//      re-verifying the target row belongs to that client.
//
// Client-visible actions: edit + save a caption/media, approve / unapprove,
// and comment. Approvals and comments drop an operator notification.
// ---------------------------------------------------------------------------

import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { canViewClient, getViewer, type Viewer } from "@/app/admin-panel/lib/viewer";

type ActionResult = { error: string | null };

const OK: ActionResult = { error: null };

function fail(message: string): ActionResult {
  return { error: message };
}

async function requireClientViewer(clientId: number): Promise<Viewer> {
  const viewer = await getViewer();
  if (!canViewClient(viewer, clientId)) notFound();
  return viewer as Viewer;
}

function viewerLabel(viewer: Viewer): string {
  return viewer.email ?? (viewer.role === "client" ? "Client" : "Operator");
}

// Confirm the post exists and belongs to this client. Returns the row's
// caption/status so callers can build a sensible notification body.
async function loadOwnedPost(
  admin: ReturnType<typeof createAdminClient>,
  clientId: number,
  postId: string
): Promise<{ id: string; caption: string; status: string } | null> {
  const { data, error } = await admin
    .from("proofer_posts")
    .select("id, client_id, caption, status")
    .eq("id", postId)
    .eq("client_id", clientId)
    .maybeSingle();
  if (error || !data) return null;
  return {
    id: String(data.id),
    caption: (data.caption as string) ?? "",
    status: (data.status as string) ?? "none",
  };
}

async function notifyOperator(
  admin: ReturnType<typeof createAdminClient>,
  clientId: number,
  postId: string,
  kind: string,
  body: string
): Promise<void> {
  const { error } = await admin.from("portal_notifications").insert({
    client_id: clientId,
    post_id: postId,
    kind,
    body,
  });
  // A missing notifications table (pre-migration) must never break the
  // client's action — degrade quietly.
  if (error && error.code !== "42P01") {
    console.error("notifyOperator error:", error);
  }
}

function revalidateBoth(clientId: number) {
  revalidatePath(`/portal/${clientId}/content`);
  revalidatePath(`/app/proofer`);
}

// ── Save caption + media ─────────────────────────────────────────────────
export async function savePortalPostAction(
  clientIdValue: string,
  postId: string,
  caption: string,
  mediaUrls: string[]
): Promise<ActionResult> {
  const clientId = Number(clientIdValue);
  if (!Number.isFinite(clientId)) return fail("Invalid client.");
  const viewer = await requireClientViewer(clientId);

  const admin = createAdminClient();
  const post = await loadOwnedPost(admin, clientId, postId);
  if (!post) return fail("Post not found.");

  const cleanMedia = (mediaUrls ?? [])
    .map((u) => (typeof u === "string" ? u.trim() : ""))
    .filter(Boolean);

  const { error } = await admin
    .from("proofer_posts")
    .update({
      caption: caption ?? "",
      media_urls: cleanMedia,
      image_url: cleanMedia[0] ?? "",
      updated_by: viewerLabel(viewer),
      updated_at: new Date().toISOString(),
    })
    .eq("id", postId)
    .eq("client_id", clientId);

  if (error) {
    console.error("savePortalPostAction error:", error);
    return fail("Could not save your changes.");
  }

  revalidateBoth(clientId);
  return OK;
}

// ── Approve / unapprove ──────────────────────────────────────────────────
// Approve → "approved". Unapprove → "proofed" (ready, awaiting sign-off).
export async function setPortalPostApprovalAction(
  clientIdValue: string,
  postId: string,
  approved: boolean
): Promise<ActionResult> {
  const clientId = Number(clientIdValue);
  if (!Number.isFinite(clientId)) return fail("Invalid client.");
  const viewer = await requireClientViewer(clientId);

  const admin = createAdminClient();
  const post = await loadOwnedPost(admin, clientId, postId);
  if (!post) return fail("Post not found.");

  const nextStatus = approved ? "approved" : "proofed";

  const { error } = await admin
    .from("proofer_posts")
    .update({
      status: nextStatus,
      updated_by: viewerLabel(viewer),
      updated_at: new Date().toISOString(),
    })
    .eq("id", postId)
    .eq("client_id", clientId);

  if (error) {
    console.error("setPortalPostApprovalAction error:", error);
    return fail("Could not update approval.");
  }

  await notifyOperator(
    admin,
    clientId,
    postId,
    approved ? "approve" : "unapprove",
    approved
      ? `Client approved a post${post.caption ? `: "${excerpt(post.caption)}"` : "."}`
      : `Client unapproved a post${post.caption ? `: "${excerpt(post.caption)}"` : "."}`
  );

  revalidateBoth(clientId);
  return OK;
}

// ── Comment ──────────────────────────────────────────────────────────────
export async function addPortalCommentAction(
  clientIdValue: string,
  postId: string,
  comment: string
): Promise<ActionResult> {
  const clientId = Number(clientIdValue);
  if (!Number.isFinite(clientId)) return fail("Invalid client.");
  const viewer = await requireClientViewer(clientId);

  const clean = (comment ?? "").trim();
  if (!clean) return fail("Write a comment first.");

  const admin = createAdminClient();
  const post = await loadOwnedPost(admin, clientId, postId);
  if (!post) return fail("Post not found.");

  const { error } = await admin.from("proofer_comments").insert({
    post_id: postId,
    comment: clean,
    created_by: viewerLabel(viewer),
    author_role: "client",
    resolved: false,
  });

  if (error) {
    console.error("addPortalCommentAction error:", error);
    return fail("Could not add your comment.");
  }

  await notifyOperator(
    admin,
    clientId,
    postId,
    "comment",
    `Client commented: "${excerpt(clean)}"`
  );

  revalidateBoth(clientId);
  return OK;
}

function excerpt(text: string, max = 80): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}
