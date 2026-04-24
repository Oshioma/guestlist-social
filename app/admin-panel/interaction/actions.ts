"use server";

import { createClient as createServiceClient } from "@supabase/supabase-js";

export type DecisionKind = "approved" | "saved" | "skipped";

export type PersistedDecision = {
  commentId: string;
  decision: DecisionKind;
};

export type SaveDecisionInput = {
  accountId: string;
  commentId: string;
  decision: DecisionKind;
  commentText?: string | null;
  commentAuthor?: string | null;
  commentPermalink?: string | null;
  posterType?: string | null;
  posterScore?: number | null;
  followerCount?: number | null;
  engagementRate?: number | null;
  relevance?: number | null;
  opportunity?: number | null;
  risk?: number | null;
};

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing Supabase env vars (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)");
  }
  return createServiceClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function saveInteractionDecision(
  input: SaveDecisionInput
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!input.accountId || !input.commentId) {
    return { ok: false, error: "Missing accountId or commentId" };
  }

  try {
    const db = getServiceSupabase();
    const { error } = await db
      .from("interaction_decisions")
      .upsert(
        {
          account_id: input.accountId,
          comment_id: input.commentId,
          decision: input.decision,
          comment_text: input.commentText ?? null,
          comment_author: input.commentAuthor ?? null,
          comment_permalink: input.commentPermalink ?? null,
          poster_type: input.posterType ?? null,
          poster_score: input.posterScore ?? null,
          follower_count: input.followerCount ?? null,
          engagement_rate: input.engagementRate ?? null,
          relevance: input.relevance ?? null,
          opportunity: input.opportunity ?? null,
          risk: input.risk ?? null,
          decided_at: new Date().toISOString(),
        },
        { onConflict: "account_id,comment_id" }
      );

    if (error) {
      console.error("[saveInteractionDecision] upsert failed:", error);
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

export async function getInteractionDecisions(
  accountId: string
): Promise<PersistedDecision[]> {
  if (!accountId) return [];
  try {
    const db = getServiceSupabase();
    const { data, error } = await db
      .from("interaction_decisions")
      .select("comment_id, decision")
      .eq("account_id", accountId)
      .order("decided_at", { ascending: false })
      .limit(1000);
    if (error) {
      console.error("[getInteractionDecisions] failed:", error);
      return [];
    }
    return (data ?? []).map((row) => ({
      commentId: String(row.comment_id),
      decision: row.decision as DecisionKind,
    }));
  } catch (err) {
    console.error("[getInteractionDecisions] threw:", err);
    return [];
  }
}
