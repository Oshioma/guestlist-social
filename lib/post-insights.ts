/**
 * Fetch post-publish insights from Meta for published proofer posts.
 *
 * Called by /api/cron/fetch-post-insights. For each published queue item
 * whose published_at is at least HOURS_AFTER_PUBLISH old and has no
 * insights_fetched_at yet, we:
 *
 *   1. Look up the connected_meta_accounts token for the client + platform.
 *   2. Call Meta's insights endpoint for the post ID.
 *   3. Write reach/impressions/engagement back to the queue row.
 *
 * We fetch once (after 24h). A future iteration could add a 7d re-fetch
 * by checking if insights_fetched_at < published_at + 7d.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { logMetaWrite } from "./meta-write-log";

const GRAPH_VERSION = "v19.0";
const HOURS_AFTER_PUBLISH = 24;

type QueueRow = {
  id: string;
  post_id: string;
  platform: string;
  published_at: string;
  publish_url: string | null;
  meta_post_id: string | null;
};

type PostRow = {
  client_id: number;
};

type AccountRow = {
  access_token: string;
};

export type InsightsSweepResult = {
  ok: true;
  scanned: number;
  fetched: number;
  skipped: number;
  failed: number;
  details: Array<{
    queueId: string;
    status: "fetched" | "skipped" | "failed";
    reason?: string;
  }>;
};

export async function fetchDueInsights(
  supabase: SupabaseClient,
  options: { limit?: number } = {}
): Promise<InsightsSweepResult> {
  const limit = options.limit ?? 50;

  const cutoff = new Date(
    Date.now() - HOURS_AFTER_PUBLISH * 60 * 60 * 1000
  ).toISOString();

  const { data: due, error } = await supabase
    .from("proofer_publish_queue")
    .select("id, post_id, platform, published_at, publish_url, meta_post_id")
    .eq("status", "published")
    .is("insights_fetched_at", null)
    .lte("published_at", cutoff)
    .order("published_at", { ascending: true })
    .limit(limit);

  if (error) {
    throw new Error(`fetchDueInsights load: ${error.message}`);
  }

  const result: InsightsSweepResult = {
    ok: true,
    scanned: due?.length ?? 0,
    fetched: 0,
    skipped: 0,
    failed: 0,
    details: [],
  };

  for (const row of (due ?? []) as QueueRow[]) {
    try {
      const outcome = await fetchOneInsight(supabase, row);
      result.details.push(outcome);
      if (outcome.status === "fetched") result.fetched++;
      else if (outcome.status === "skipped") result.skipped++;
    } catch (err) {
      result.failed++;
      result.details.push({
        queueId: row.id,
        status: "failed",
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return result;
}

async function fetchOneInsight(
  supabase: SupabaseClient,
  row: QueueRow
): Promise<{ queueId: string; status: "fetched" | "skipped"; reason?: string }> {
  // We need the meta_post_id. If it wasn't stored at publish time, try to
  // extract it from the publish_url.
  let metaPostId = row.meta_post_id;
  if (!metaPostId && row.publish_url) {
    metaPostId = extractMetaPostId(row.publish_url);
  }
  if (!metaPostId) {
    await supabase
      .from("proofer_publish_queue")
      .update({ insights_fetched_at: new Date().toISOString() })
      .eq("id", row.id);
    return {
      queueId: row.id,
      status: "skipped",
      reason: "No meta_post_id or publish_url to extract from",
    };
  }

  // Look up the post's client_id so we can find the right token.
  const { data: post } = await supabase
    .from("proofer_posts")
    .select("client_id")
    .eq("id", row.post_id)
    .single<PostRow>();

  if (!post) {
    return { queueId: row.id, status: "skipped", reason: "Post row not found" };
  }

  // Get the connected account token.
  const { data: account } = await supabase
    .from("connected_meta_accounts")
    .select("access_token")
    .eq("client_id", post.client_id)
    .eq("platform", row.platform === "facebook" ? "facebook" : "instagram")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle<AccountRow>();

  if (!account) {
    return {
      queueId: row.id,
      status: "skipped",
      reason: `No connected ${row.platform} account for client ${post.client_id}`,
    };
  }

  // Fetch insights from Meta.
  const insights = await fetchMetaInsights(
    metaPostId,
    account.access_token,
    row.platform
  );

  // Write back to the queue row.
  await supabase
    .from("proofer_publish_queue")
    .update({
      meta_post_id: metaPostId,
      insights_fetched_at: new Date().toISOString(),
      insights_reach: insights.reach,
      insights_impressions: insights.impressions,
      insights_engagement: insights.engagement,
      insights_likes: insights.likes,
      insights_comments: insights.comments,
      insights_shares: insights.shares,
      insights_saves: insights.saves,
    })
    .eq("id", row.id);

  return { queueId: row.id, status: "fetched" };
}

type PostInsights = {
  reach: number | null;
  impressions: number | null;
  engagement: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
};

async function fetchMetaInsights(
  postId: string,
  accessToken: string,
  platform: string
): Promise<PostInsights> {
  const empty: PostInsights = {
    reach: null,
    impressions: null,
    engagement: null,
    likes: null,
    comments: null,
    shares: null,
    saves: null,
  };

  if (platform === "facebook") {
    return fetchFacebookInsights(postId, accessToken);
  }
  return fetchInstagramInsights(postId, accessToken);
}

async function fetchFacebookInsights(
  postId: string,
  accessToken: string
): Promise<PostInsights> {
  const fields =
    "insights.metric(post_impressions,post_impressions_unique,post_engaged_users,post_reactions_like_total)";
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${postId}?fields=${fields}&access_token=${accessToken}`;

  const start = Date.now();
  const res = await fetch(url, { cache: "no-store" });
  const data = await res.json();

  logMetaWrite({
    operation: "insights:facebook",
    metaEndpoint: `/${postId}`,
    requestBody: { fields },
    responseStatus: res.status,
    responseBody: data,
    success: res.ok,
    errorMessage: data.error?.message ?? null,
    durationMs: Date.now() - start,
  });

  if (!res.ok || data.error) {
    // Fallback: try basic fields.
    const fallbackUrl = `https://graph.facebook.com/${GRAPH_VERSION}/${postId}?fields=shares,likes.summary(true),comments.summary(true)&access_token=${accessToken}`;
    const fallbackRes = await fetch(fallbackUrl, { cache: "no-store" });
    const fallbackData = await fallbackRes.json();

    if (!fallbackRes.ok) {
      return {
        reach: null,
        impressions: null,
        engagement: null,
        likes: fallbackData.likes?.summary?.total_count ?? null,
        comments: fallbackData.comments?.summary?.total_count ?? null,
        shares: fallbackData.shares?.count ?? null,
        saves: null,
      };
    }

    return {
      reach: null,
      impressions: null,
      engagement: null,
      likes: fallbackData.likes?.summary?.total_count ?? null,
      comments: fallbackData.comments?.summary?.total_count ?? null,
      shares: fallbackData.shares?.count ?? null,
      saves: null,
    };
  }

  const metrics = data.insights?.data ?? [];
  const byName: Record<string, number> = {};
  for (const m of metrics) {
    if (m.name && m.values?.[0]?.value != null) {
      byName[m.name] = Number(m.values[0].value);
    }
  }

  return {
    reach: byName.post_impressions_unique ?? null,
    impressions: byName.post_impressions ?? null,
    engagement: byName.post_engaged_users ?? null,
    likes: byName.post_reactions_like_total ?? null,
    comments: null,
    shares: null,
    saves: null,
  };
}

async function fetchInstagramInsights(
  mediaId: string,
  accessToken: string
): Promise<PostInsights> {
  const metrics = "reach,impressions,likes,comments,shares,saved";
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${mediaId}/insights?metric=${metrics}&access_token=${accessToken}`;

  const start = Date.now();
  const res = await fetch(url, { cache: "no-store" });
  const data = await res.json();

  logMetaWrite({
    operation: "insights:instagram",
    metaEndpoint: `/${mediaId}/insights`,
    requestBody: { metric: metrics },
    responseStatus: res.status,
    responseBody: data,
    success: res.ok,
    errorMessage: data.error?.message ?? null,
    durationMs: Date.now() - start,
  });

  if (!res.ok || data.error) {
    // IG insights endpoint may not be available for all media types.
    // Try the basic fields endpoint as fallback.
    const fallbackUrl = `https://graph.facebook.com/${GRAPH_VERSION}/${mediaId}?fields=like_count,comments_count&access_token=${accessToken}`;
    const fallbackRes = await fetch(fallbackUrl, { cache: "no-store" });
    const fallbackData = await fallbackRes.json();

    return {
      reach: null,
      impressions: null,
      engagement: null,
      likes: fallbackData.like_count ?? null,
      comments: fallbackData.comments_count ?? null,
      shares: null,
      saves: null,
    };
  }

  const byName: Record<string, number> = {};
  for (const m of data.data ?? []) {
    if (m.name && m.values?.[0]?.value != null) {
      byName[m.name] = Number(m.values[0].value);
    }
  }

  const likes = byName.likes ?? null;
  const comments = byName.comments ?? null;
  const shares = byName.shares ?? null;
  const saves = byName.saved ?? null;
  const engagement =
    likes != null || comments != null || shares != null || saves != null
      ? (likes ?? 0) + (comments ?? 0) + (shares ?? 0) + (saves ?? 0)
      : null;

  return {
    reach: byName.reach ?? null,
    impressions: byName.impressions ?? null,
    engagement,
    likes,
    comments,
    shares,
    saves,
  };
}

function extractMetaPostId(url: string): string | null {
  if (!url) return null;
  // Facebook: https://www.facebook.com/123_456 or https://www.facebook.com/456
  const fbMatch = url.match(/facebook\.com\/(\d+_?\d*)/);
  if (fbMatch) return fbMatch[1];
  // Instagram permalink: .../<media_id>/
  const igMatch = url.match(/instagram\.com\/p\/([A-Za-z0-9_-]+)/);
  if (igMatch) return igMatch[1];
  return null;
}
