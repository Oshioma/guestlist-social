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

function normalizeStatus(value: string): Status {
  return (VALID_STATUSES as readonly string[]).includes(value)
    ? (value as Status)
    : "none";
}

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

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const authorEmail = user?.email ?? "unknown";

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
        ? (existing.status as Status)
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

    if (error) throw new Error("Could not save post.");
  } else {
    if (!hasContent) return;

    const { error } = await supabase.from("proofer_posts").insert({
      client_id: clientId,
      post_date: postDate,
      caption,
      image_url: imageUrl,
      status: "check",
      created_by: authorEmail,
    });

    if (error) throw new Error("Could not save post.");
  }

  revalidatePath("/app/proofer");
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

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const authorEmail = user?.email ?? "unknown";

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

    if (error) throw new Error("Could not update status.");
  } else {
    const { error } = await supabase.from("proofer_posts").insert({
      client_id: clientId,
      post_date: postDate,
      caption: "",
      image_url: "",
      status: normalized,
      created_by: authorEmail,
    });

    if (error) throw new Error("Could not update status.");
  }

  revalidatePath("/app/proofer");
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

  if (error) throw new Error("Could not delete post.");

  revalidatePath("/app/proofer");
}
