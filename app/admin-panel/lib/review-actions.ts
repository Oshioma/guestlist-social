"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Server actions for the client review layer.
//
// All writes use the service-role client so they bypass RLS — these actions
// run inside the admin app and the public share view, never in untrusted
// browser code.
// ---------------------------------------------------------------------------

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env vars");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

type Approval = {
  id: number;
  review_id: number;
  proposal_index: number;
  proposal_label: string;
  proposal_detail: string | null;
  proposal_type: string;
  status: string;
  resulting_action_id: string | null;
  resulting_decision_id: number | null;
};

type ReviewLite = {
  id: number;
  client_id: number;
  what_next: NextItem[] | null;
};

type NextItem = {
  idx: number;
  label: string;
  detail: string;
  type: "scale" | "fix" | "launch" | "pause" | "budget";
  ad_id: number | null;
  source_action_id: string | null;
  source_decision_id: number | null;
};

// ---------------------------------------------------------------------------
// approveProposal: flip an approval row + mint the corresponding ad_action /
// ad_decision so the work shows up in the action engine.
// ---------------------------------------------------------------------------
export async function approveProposal(
  approvalId: number,
  decision: "approved" | "declined",
  note?: string
) {
  const supabase = admin();

  const { data: approvalRow, error: appErr } = await supabase
    .from("review_approvals")
    .select(
      "id, review_id, proposal_index, proposal_label, proposal_detail, proposal_type, status, resulting_action_id, resulting_decision_id"
    )
    .eq("id", approvalId)
    .single();
  if (appErr || !approvalRow) {
    throw new Error(appErr?.message ?? "Approval not found");
  }
  const approval = approvalRow as Approval;

  const { data: reviewRow, error: revErr } = await supabase
    .from("reviews")
    .select("id, client_id, what_next")
    .eq("id", approval.review_id)
    .single();
  if (revErr || !reviewRow) {
    throw new Error(revErr?.message ?? "Review not found");
  }
  const review = reviewRow as ReviewLite;

  const nextItem =
    (review.what_next ?? []).find(
      (n) => n.idx === approval.proposal_index
    ) ?? null;

  const update: Record<string, unknown> = {
    status: decision,
    client_note: note ?? null,
    decided_at: new Date().toISOString(),
  };

  // Only mint a backing row when approving and we don't already have one.
  if (
    decision === "approved" &&
    !approval.resulting_action_id &&
    !approval.resulting_decision_id
  ) {
    if (
      (approval.proposal_type === "scale" ||
        approval.proposal_type === "fix" ||
        approval.proposal_type === "launch" ||
        approval.proposal_type === "pause") &&
      nextItem?.ad_id
    ) {
      // Mint an ad_action so it surfaces in the per-ad action queue.
      const priority =
        approval.proposal_type === "fix" || approval.proposal_type === "pause"
          ? "high"
          : "medium";
      const { data: action, error: actErr } = await supabase
        .from("ad_actions")
        .insert({
          ad_id: nextItem.ad_id,
          problem: approval.proposal_label,
          action: approval.proposal_detail ?? approval.proposal_label,
          priority,
          status: "pending",
          hypothesis: `Approved from review #${review.id}`,
        })
        .select("id")
        .single();
      if (!actErr && action) {
        update.resulting_action_id = action.id;
      }
    } else if (approval.proposal_type === "budget" || !nextItem?.ad_id) {
      // Mint an ad_decision (or fall back to one when there's no ad target).
      const { data: dec, error: decErr } = await supabase
        .from("ad_decisions")
        .insert({
          client_id: review.client_id,
          ad_id: nextItem?.ad_id ?? null,
          type:
            approval.proposal_type === "budget"
              ? "scale_budget"
              : "apply_winning_pattern",
          reason: `Approved from review #${review.id}: ${approval.proposal_label}`,
          action: approval.proposal_detail ?? approval.proposal_label,
          confidence: "medium",
          status: "approved",
          approved_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      if (!decErr && dec) {
        update.resulting_decision_id = dec.id;
      }
    }
  }

  const { error: updErr } = await supabase
    .from("review_approvals")
    .update(update)
    .eq("id", approvalId);
  if (updErr) throw new Error(updErr.message);

  revalidatePath(
    `/app/clients/${review.client_id}/reviews/${review.id}`
  );
  revalidatePath(`/app/clients/${review.client_id}/reviews`);
}

// ---------------------------------------------------------------------------
// sendReviewForApproval: flip the review to 'sent' and mint a share token.
// ---------------------------------------------------------------------------
export async function sendReviewForApproval(reviewId: number) {
  const supabase = admin();

  const { data: existing } = await supabase
    .from("reviews")
    .select("id, client_id, share_token, status")
    .eq("id", reviewId)
    .single();
  if (!existing) throw new Error("Review not found");

  const token =
    (existing as { share_token: string | null }).share_token ??
    randomBytes(18).toString("base64url");

  const { error } = await supabase
    .from("reviews")
    .update({
      status: "sent",
      share_token: token,
      sent_at: new Date().toISOString(),
    })
    .eq("id", reviewId);
  if (error) throw new Error(error.message);

  const clientId = (existing as { client_id: number }).client_id;
  revalidatePath(`/app/clients/${clientId}/reviews/${reviewId}`);
  revalidatePath(`/app/clients/${clientId}/reviews`);

  return { token };
}

// ---------------------------------------------------------------------------
// approveProposalByShareToken: same as approveProposal but the share_token
// is the auth, so it can be called from the public /r/[token] view without
// the operator being logged in.
// ---------------------------------------------------------------------------
export async function approveProposalByShareToken(
  token: string,
  approvalId: number,
  decision: "approved" | "declined",
  note?: string
) {
  const supabase = admin();

  // Look up the approval and verify it belongs to a review that matches
  // the supplied share token.
  const { data: approvalRow, error: appErr } = await supabase
    .from("review_approvals")
    .select(
      "id, review_id, proposal_index, proposal_label, proposal_detail, proposal_type, status, resulting_action_id, resulting_decision_id"
    )
    .eq("id", approvalId)
    .single();
  if (appErr || !approvalRow) {
    throw new Error("Approval not found");
  }
  const approval = approvalRow as Approval;

  const { data: reviewRow } = await supabase
    .from("reviews")
    .select("id, share_token, status")
    .eq("id", approval.review_id)
    .single();
  if (
    !reviewRow ||
    (reviewRow as { share_token: string | null }).share_token !== token
  ) {
    throw new Error("Invalid share token");
  }
  if ((reviewRow as { status: string }).status === "draft") {
    throw new Error("Review hasn't been sent yet");
  }

  // Delegate to the main approval action — it already does the action /
  // decision minting and revalidation.
  await approveProposal(approvalId, decision, note);
  revalidatePath(`/r/${token}`);
}

// ---------------------------------------------------------------------------
// markReviewApproved: client (or operator on their behalf) signs the whole
// review off. Doesn't auto-approve individual proposals — those still need
// per-row approval.
// ---------------------------------------------------------------------------
export async function markReviewApproved(reviewId: number, approvedBy?: string) {
  const supabase = admin();

  const { data: existing } = await supabase
    .from("reviews")
    .select("id, client_id")
    .eq("id", reviewId)
    .single();
  if (!existing) throw new Error("Review not found");

  const { error } = await supabase
    .from("reviews")
    .update({
      status: "approved",
      approved_at: new Date().toISOString(),
      approved_by: approvedBy ?? null,
    })
    .eq("id", reviewId);
  if (error) throw new Error(error.message);

  const clientId = (existing as { client_id: number }).client_id;
  revalidatePath(`/app/clients/${clientId}/reviews/${reviewId}`);
  revalidatePath(`/app/clients/${clientId}/reviews`);
}
