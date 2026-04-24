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

export type SearchKind =
  | "handle"
  | "hashtag"
  | "mentions"
  | "keyword"
  | "location";

export type SavedSearch = {
  id: number;
  accountId: string;
  kind: SearchKind;
  value: string;
  label: string | null;
  createdAt: string;
};

export async function listInteractionSearches(
  accountId: string
): Promise<SavedSearch[]> {
  if (!accountId) return [];
  try {
    const db = getServiceSupabase();
    const { data, error } = await db
      .from("interaction_searches")
      .select("id, account_id, kind, value, label, created_at")
      .eq("account_id", accountId)
      .order("created_at", { ascending: false });
    if (error) {
      console.error("[listInteractionSearches] failed:", error);
      return [];
    }
    return (data ?? []).map((row) => ({
      id: Number(row.id),
      accountId: String(row.account_id),
      kind: row.kind as SearchKind,
      value: String(row.value),
      label: row.label as string | null,
      createdAt: String(row.created_at),
    }));
  } catch (err) {
    console.error("[listInteractionSearches] threw:", err);
    return [];
  }
}

function normalizeSearchValue(kind: SearchKind, value: string): string {
  const raw = value.trim();
  if (!raw) return "";
  if (kind === "handle") return raw.replace(/^@+/, "").toLowerCase();
  if (kind === "hashtag") return raw.replace(/^#+/, "").toLowerCase();
  return raw.toLowerCase();
}

export async function addInteractionSearch(input: {
  accountId: string;
  kind: SearchKind;
  value: string;
  label?: string | null;
}): Promise<{ ok: true; search: SavedSearch } | { ok: false; error: string }> {
  const normalized = normalizeSearchValue(input.kind, input.value);
  if (!input.accountId || !normalized) {
    return { ok: false, error: "accountId and value are required" };
  }
  try {
    const db = getServiceSupabase();
    const { data, error } = await db
      .from("interaction_searches")
      .upsert(
        {
          account_id: input.accountId,
          kind: input.kind,
          value: normalized,
          label: input.label ?? null,
        },
        { onConflict: "account_id,kind,value" }
      )
      .select("id, account_id, kind, value, label, created_at")
      .single();
    if (error || !data) {
      return { ok: false, error: error?.message ?? "Failed to save search" };
    }
    return {
      ok: true,
      search: {
        id: Number(data.id),
        accountId: String(data.account_id),
        kind: data.kind as SearchKind,
        value: String(data.value),
        label: data.label as string | null,
        createdAt: String(data.created_at),
      },
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

export async function removeInteractionSearch(
  id: number
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!Number.isFinite(id) || id <= 0) {
    return { ok: false, error: "Invalid search id" };
  }
  try {
    const db = getServiceSupabase();
    const { error } = await db
      .from("interaction_searches")
      .delete()
      .eq("id", id);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

// ----------------------------------------------------------------------------
// Integration credentials (RapidAPI IG scraper — for Discovery "location"
// and "keyword" kinds). Stored server-side so operators can paste their
// RapidAPI key + endpoints via the Discovery UI without redeploying.
// ----------------------------------------------------------------------------

export type IgScraperSettings = {
  hasApiKey: boolean;
  host: string | null;
  locationSearchPath: string | null;
  locationPostsPath: string | null;
  updatedAt: string | null;
};

export async function getIgScraperSettings(): Promise<IgScraperSettings> {
  try {
    const db = getServiceSupabase();
    const { data } = await db
      .from("interaction_integrations")
      .select("api_key, host, location_search_path, location_posts_path, updated_at")
      .eq("account_id", "default")
      .eq("provider", "rapidapi_ig")
      .limit(1)
      .maybeSingle();
    return {
      // Never return the actual key to the browser — just whether one is set.
      hasApiKey: Boolean(data?.api_key),
      host: (data?.host as string | null) ?? null,
      locationSearchPath: (data?.location_search_path as string | null) ?? null,
      locationPostsPath: (data?.location_posts_path as string | null) ?? null,
      updatedAt: (data?.updated_at as string | null) ?? null,
    };
  } catch (err) {
    console.error("[getIgScraperSettings] failed:", err);
    return {
      hasApiKey: false,
      host: null,
      locationSearchPath: null,
      locationPostsPath: null,
      updatedAt: null,
    };
  }
}

export type SaveIgScraperInput = {
  apiKey?: string;
  host?: string;
  locationSearchPath?: string;
  locationPostsPath?: string;
};

export async function saveIgScraperSettings(
  input: SaveIgScraperInput
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const db = getServiceSupabase();
    // Build a patch that only touches fields the operator filled in, so
    // clearing the key input by accident doesn't wipe their saved key.
    const patch: Record<string, unknown> = {
      account_id: "default",
      provider: "rapidapi_ig",
      updated_at: new Date().toISOString(),
    };
    if (input.apiKey && input.apiKey.trim()) patch.api_key = input.apiKey.trim();
    if (input.host !== undefined)
      patch.host = input.host.trim() || null;
    if (input.locationSearchPath !== undefined)
      patch.location_search_path = input.locationSearchPath.trim() || null;
    if (input.locationPostsPath !== undefined)
      patch.location_posts_path = input.locationPostsPath.trim() || null;

    const { error } = await db
      .from("interaction_integrations")
      .upsert(patch, { onConflict: "account_id,provider" });
    if (error) {
      console.error("[saveIgScraperSettings] upsert failed:", error);
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

// Internal helper for the discover route — returns the full record
// including the api_key so it can call RapidAPI.
export type IgScraperCredentials = {
  apiKey: string | null;
  host: string | null;
  locationSearchPath: string | null;
  locationPostsPath: string | null;
};

export async function getIgScraperCredentialsInternal(): Promise<IgScraperCredentials> {
  try {
    const db = getServiceSupabase();
    const { data } = await db
      .from("interaction_integrations")
      .select("api_key, host, location_search_path, location_posts_path")
      .eq("account_id", "default")
      .eq("provider", "rapidapi_ig")
      .limit(1)
      .maybeSingle();
    return {
      apiKey: (data?.api_key as string | null) ?? null,
      host: (data?.host as string | null) ?? null,
      locationSearchPath: (data?.location_search_path as string | null) ?? null,
      locationPostsPath: (data?.location_posts_path as string | null) ?? null,
    };
  } catch (err) {
    console.error("[getIgScraperCredentialsInternal] failed:", err);
    return {
      apiKey: null,
      host: null,
      locationSearchPath: null,
      locationPostsPath: null,
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
