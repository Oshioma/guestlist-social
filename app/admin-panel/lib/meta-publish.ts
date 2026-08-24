"use server";

// Publishing layer for the proofer publish queue. This is the ONLY place
// that talks to Meta's Graph API for content publishing — the UI just fires
// publishMetaQueueItem(queueId) and this module loads the post, the
// connected account, hits the Graph endpoints, and flips the queue row's
// status to "published" or "failed" with the result.
//
// Source of truth is always proofer_publish_queue. Meta is the delivery
// layer. Do not introduce parallel flows.

import { revalidatePath } from "next/cache";
import {
  INSTAGRAM_GRAPH_BASE,
  META_GRAPH_VERSION,
  metaServiceClient,
} from "./meta-auth";
import { logMetaWrite } from "../../../lib/meta-write-log";
import { resolveAccountMatch } from "./account-match";

type PublishResult =
  | { ok: true; publishUrl: string | null }
  | { ok: false; error: string };

// Which ONE account a post may publish to is decided by resolveAccountMatch
// (../account-match), the SAME pure logic the publish board runs to warn the
// operator at schedule time. This module never guesses — see account-match.ts
// for the full rationale.

// Detect a video URL so we can route to Meta's video endpoints instead of the
// image ones. Mirrors the Proofer's isVideoUrl (ProoferBoard.tsx) — the same
// signal that draws the play button in the UI — so publishing agrees with what
// the operator saw. Sending a video to the image endpoints fails hard ("image
// format video/mp4 … could not be converted to JPEG"), which is exactly the
// bug this routing guards against.
function isVideoUrl(url: string): boolean {
  if (!url) return false;
  if (/\.(mp4|mov|webm|m4v|ogv)(\?|$)/i.test(url)) return true;
  // Google Drive video URLs use the uc endpoint (no file extension).
  if (/drive\.google\.com\/uc\?/.test(url)) return true;
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Instagram video (Reels / Story video) can't be published until Meta finishes
// processing the uploaded clip — media_publish before then returns "Media not
// ready". So we create the container, then poll its status_code until FINISHED.
// Budget: ~115s (23 waits × 5s), inside the cron's 300s maxDuration and enough
// for typical short clips. A longer clip that isn't ready in time fails with a
// retry hint rather than hanging.
const IG_CONTAINER_POLL_INTERVAL_MS = 5000;
const IG_CONTAINER_POLL_MAX_ATTEMPTS = 24;

async function waitForContainerReady(
  containerId: string,
  pageToken: string,
  operation: string,
  apiBase: string
): Promise<void> {
  for (let attempt = 0; attempt < IG_CONTAINER_POLL_MAX_ATTEMPTS; attempt++) {
    // Check immediately on the first pass, then space subsequent checks out.
    if (attempt > 0) await sleep(IG_CONTAINER_POLL_INTERVAL_MS);

    const statusUrl = new URL(`${apiBase}/${containerId}`);
    statusUrl.searchParams.set("fields", "status_code,status");
    statusUrl.searchParams.set("access_token", pageToken);

    const start = Date.now();
    const res = await fetch(statusUrl.toString(), { cache: "no-store" });
    const data = (await res.json()) as {
      status_code?: string;
      status?: string;
      error?: { message?: string };
    };
    logMetaWrite({
      operation,
      metaEndpoint: `/${containerId}?fields=status_code`,
      requestBody: { fields: "status_code" },
      responseStatus: res.status,
      responseBody: data,
      success: res.ok,
      errorMessage: data.error?.message ?? null,
      durationMs: Date.now() - start,
    });
    if (!res.ok) {
      throw new Error(
        `IG container status check failed: ${res.status} ${JSON.stringify(data)}`
      );
    }

    const code = data.status_code;
    if (code === "FINISHED") return;
    if (code === "ERROR" || code === "EXPIRED") {
      throw new Error(
        `IG video processing ${code}: ${data.status ?? JSON.stringify(data)}`
      );
    }
    // IN_PROGRESS — keep waiting.
  }
  const budgetSeconds =
    ((IG_CONTAINER_POLL_MAX_ATTEMPTS - 1) * IG_CONTAINER_POLL_INTERVAL_MS) /
    1000;
  throw new Error(
    `IG video still processing after ${budgetSeconds}s. The clip may be large — ` +
      `try "Publish now" again shortly.`
  );
}

// Even after a container reports FINISHED, Meta can still reject media_publish
// with a transient "not ready" error (code 9007 / subcode 2207027, "The media
// is not ready for publishing, please wait for a moment") — ingestion is
// eventually-consistent, so the publish edge sometimes lags the status edge by
// a few seconds. It clears on its own, so retry a few times before giving up.
// Everything else (bad token, policy block, an error not flagged transient) is
// terminal and throws on the first response without burning the retry budget.
const IG_PUBLISH_RETRY_MAX_ATTEMPTS = 4;
const IG_PUBLISH_RETRY_INTERVAL_MS = 3000;

function isMediaNotReadyError(body: {
  error?: { code?: number; error_subcode?: number; is_transient?: boolean };
}): boolean {
  const e = body?.error;
  if (!e) return false;
  // 9007 + 2207027 is the canonical "media not ready" pairing; honour an
  // explicit is_transient flag too, in case Meta reshuffles the codes.
  return e.code === 9007 || e.error_subcode === 2207027 || e.is_transient === true;
}

// Publish a prepared IG container, retrying only the transient "media not
// ready" case. Returns the published media id (or null if Meta returns 200 with
// no id, matching the previous per-path behaviour); throws with the raw Meta
// body on a terminal failure or once the retries are exhausted.
async function publishIgContainer(args: {
  igAccountId: string;
  creationId: string;
  pageToken: string;
  apiBase: string;
  operation: string; // logMetaWrite label, e.g. "publish:instagram"
  label: string; // error-message prefix, e.g. "IG", "IG Story"
}): Promise<string | null> {
  const { igAccountId, creationId, pageToken, apiBase, operation, label } = args;

  const params = new URLSearchParams();
  params.set("creation_id", creationId);
  params.set("access_token", pageToken);

  let lastStatus = 0;
  let lastBody: unknown = null;
  for (let attempt = 0; attempt < IG_PUBLISH_RETRY_MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) await sleep(IG_PUBLISH_RETRY_INTERVAL_MS);

    const start = Date.now();
    const res = await fetch(`${apiBase}/${igAccountId}/media_publish`, {
      method: "POST",
      body: params,
      cache: "no-store",
    });
    const data = (await res.json()) as {
      id?: string;
      error?: {
        message?: string;
        code?: number;
        error_subcode?: number;
        is_transient?: boolean;
      };
    };
    logMetaWrite({
      operation,
      metaEndpoint: `/${igAccountId}/media_publish`,
      requestBody: { creation_id: creationId, attempt: attempt + 1 },
      responseStatus: res.status,
      responseBody: data,
      success: res.ok && !!data.id,
      errorMessage: data.error?.message ?? null,
      durationMs: Date.now() - start,
    });

    if (res.ok) return data.id ?? null;

    lastStatus = res.status;
    lastBody = data;
    // Only the transient not-ready case is worth waiting on; anything else is
    // terminal, so stop now rather than spend the remaining attempts.
    if (!isMediaNotReadyError(data)) break;
  }

  throw new Error(
    `${label} /media_publish failed: ${lastStatus} ${JSON.stringify(lastBody)}`
  );
}

// Look up an Instagram media permalink, best-effort (null on any failure).
async function lookupInstagramPermalink(
  mediaId: string,
  pageToken: string,
  apiBase: string
): Promise<string | null> {
  try {
    const permalinkUrl = new URL(`${apiBase}/${mediaId}`);
    permalinkUrl.searchParams.set("fields", "permalink");
    permalinkUrl.searchParams.set("access_token", pageToken);
    const res = await fetch(permalinkUrl.toString(), { cache: "no-store" });
    if (res.ok) {
      const data = (await res.json()) as { permalink?: string };
      if (data.permalink) return data.permalink;
    }
  } catch {
    // fall through
  }
  return null;
}

// Record why a scheduled publish couldn't run, WITHOUT changing its status.
// Pre-flight failures (no connected account, post not approved) intentionally
// leave the row 'scheduled' so the 5-minute cron keeps retrying and the post
// goes out once the issue is fixed — but we stash the reason in `notes` so the
// UI can show *why* it hasn't published, instead of the card sitting silently
// on "Scheduled" forever.
async function noteScheduledIssue(
  admin: ReturnType<typeof metaServiceClient>,
  queueId: string,
  message: string
): Promise<void> {
  try {
    await admin
      .from("proofer_publish_queue")
      .update({
        notes: message.slice(0, 2000),
        updated_at: new Date().toISOString(),
      })
      .eq("id", queueId);
    revalidatePath("/admin-panel/proofer/publish");
  } catch {
    // Best-effort — never let note-writing mask the original failure.
  }
}

export async function publishMetaQueueItem(
  queueId: string
): Promise<PublishResult> {
  if (!queueId) {
    return { ok: false, error: "Queue item id is required." };
  }

  let admin;
  try {
    admin = metaServiceClient();
  } catch (err) {
    return {
      ok: false,
      error: `Meta service not configured: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // 1. Queue item
  const { data: queueItem, error: queueErr } = await admin
    .from("proofer_publish_queue")
    .select("id, post_id, platform, status")
    .eq("id", queueId)
    .maybeSingle();

  if (queueErr) {
    return { ok: false, error: `queue lookup: ${queueErr.message}` };
  }
  if (!queueItem) {
    return { ok: false, error: "Queue item not found." };
  }
  if (queueItem.status === "published") {
    return { ok: false, error: "Queue item is already published." };
  }

  // 2. Post
  const { data: post, error: postErr } = await admin
    .from("proofer_posts")
    .select("id, client_id, caption, image_url, media_urls, status, platform")
    .eq("id", queueItem.post_id)
    .maybeSingle();

  if (postErr) {
    await noteScheduledIssue(admin, queueId, `post lookup: ${postErr.message}`);
    return { ok: false, error: `post lookup: ${postErr.message}` };
  }
  if (!post) {
    await noteScheduledIssue(admin, queueId, "Post not found.");
    return { ok: false, error: "Post not found." };
  }
  if (post.status !== "proofed" && post.status !== "approved") {
    const msg = `Can't publish yet — the post is "${post.status}", not approved. Approve it in the Proofer.`;
    await noteScheduledIssue(admin, queueId, msg);
    return { ok: false, error: msg };
  }

  // 3. Connected account — resolve AND verify.
  //
  // A single Meta login can administer many brands' Pages, so the OAuth
  // connect flow can attach several accounts under one client_id. We must
  // NEVER guess which one a post belongs to (that is exactly the bug that
  // sent Organzibar's posts to another client's Instagram). Instead we pin
  // the target to the handle the post was written for — the client's
  // declared `ig_handle` — and refuse to publish if nothing matches.
  const platform = queueItem.platform as "facebook" | "instagram";

  // Defensive select: `fb_page` is a newer column, so fall back if a
  // database hasn't run the migration yet — publishing must never break on
  // a missing optional column.
  type ClientRow = {
    name?: string | null;
    ig_handle?: string | null;
    fb_page?: string | null;
  };
  let client: ClientRow | null = null;
  const clientFull = await admin
    .from("clients")
    .select("id, name, ig_handle, fb_page")
    .eq("id", post.client_id)
    .maybeSingle();
  if (clientFull.error) {
    const fallback = await admin
      .from("clients")
      .select("id, name, ig_handle")
      .eq("id", post.client_id)
      .maybeSingle();
    if (fallback.error) {
      await noteScheduledIssue(admin, queueId, `client lookup: ${fallback.error.message}`);
      return { ok: false, error: `client lookup: ${fallback.error.message}` };
    }
    client = (fallback.data ?? null) as ClientRow | null;
  } else {
    client = (clientFull.data ?? null) as ClientRow | null;
  }
  const clientHandle: string | null = client?.ig_handle ?? null;
  const clientFbPage: string | null = client?.fb_page ?? null;

  type ConnectedAccount = {
    account_id: string;
    access_token: string;
    account_name: string | null;
    auth_type?: string | null;
  };
  // Defensive select: auth_type is a newer column. Fall back to the older
  // shape if the migration hasn't run yet — publishing must never break on a
  // missing optional column (same pattern as the clients.fb_page select).
  let accounts: ConnectedAccount[] | null = null;
  let accountErr: { message: string } | null = null;
  const accountsFull = await admin
    .from("connected_meta_accounts")
    .select("account_id, access_token, account_name, auth_type")
    .eq("client_id", post.client_id)
    .eq("platform", platform)
    .order("updated_at", { ascending: false });
  if (accountsFull.error) {
    const fallback = await admin
      .from("connected_meta_accounts")
      .select("account_id, access_token, account_name")
      .eq("client_id", post.client_id)
      .eq("platform", platform)
      .order("updated_at", { ascending: false });
    accounts = (fallback.data ?? null) as ConnectedAccount[] | null;
    accountErr = fallback.error;
  } else {
    accounts = (accountsFull.data ?? null) as ConnectedAccount[] | null;
  }

  if (accountErr) {
    await noteScheduledIssue(admin, queueId, `account lookup: ${accountErr.message}`);
    return { ok: false, error: `account lookup: ${accountErr.message}` };
  }

  const resolved = resolveAccountMatch<ConnectedAccount>({
    accounts: (accounts ?? []) as ConnectedAccount[],
    platform,
    handle: clientHandle,
    fbPage: clientFbPage,
  });
  if (!resolved.ok) {
    await noteScheduledIssue(admin, queueId, resolved.reason);
    return { ok: false, error: resolved.reason };
  }
  const account = resolved.account;

  const caption: string = (post.caption as string | null) ?? "";
  const mediaUrls: string[] = Array.isArray(post.media_urls)
    ? (post.media_urls as string[])
    : [];
  const imageUrl: string =
    (post.image_url as string | null) || mediaUrls[0] || "";

  const postPlatform: string = (post as any).platform ?? "";
  const isStory =
    postPlatform === "instagram_story" || postPlatform === "instagram_stories";
  // The media URL doubles as the video URL when it points at a video file —
  // route those to the video endpoints (FB /videos, IG Reels/Story video)
  // instead of the image ones, which reject video/mp4.
  const isVideo = isVideoUrl(imageUrl);

  // Which Graph host + token the Instagram calls use depends on HOW the
  // account was connected. Facebook-Login accounts publish to Instagram via
  // the parent Page token against graph.facebook.com; Instagram-Login accounts
  // (no Facebook Page) publish with the Instagram user token against
  // graph.instagram.com. Facebook publishing is always the Page path.
  const igApiBase =
    account.auth_type === "instagram_login"
      ? INSTAGRAM_GRAPH_BASE
      : `https://graph.facebook.com/${META_GRAPH_VERSION}`;

  // 4. Publish
  try {
    let publishUrl: string | null = null;

    if (platform === "facebook") {
      publishUrl = isVideo
        ? await publishFacebookVideo({
            pageId: account.account_id,
            pageToken: account.access_token,
            caption,
            videoUrl: imageUrl,
          })
        : await publishFacebookPost({
            pageId: account.account_id,
            pageToken: account.access_token,
            caption,
            imageUrl,
          });
    } else if (isStory) {
      publishUrl = isVideo
        ? await publishInstagramStoryVideo({
            igAccountId: account.account_id,
            pageToken: account.access_token,
            videoUrl: imageUrl,
            apiBase: igApiBase,
          })
        : await publishInstagramStory({
            igAccountId: account.account_id,
            pageToken: account.access_token,
            imageUrl,
            apiBase: igApiBase,
          });
    } else {
      publishUrl = isVideo
        ? await publishInstagramVideo({
            igAccountId: account.account_id,
            pageToken: account.access_token,
            caption,
            videoUrl: imageUrl,
            apiBase: igApiBase,
          })
        : await publishInstagramPost({
            igAccountId: account.account_id,
            pageToken: account.access_token,
            caption,
            imageUrl,
            apiBase: igApiBase,
          });
    }

    const now = new Date().toISOString();
    await admin
      .from("proofer_publish_queue")
      .update({
        status: "published",
        published_at: now,
        publish_url: publishUrl,
        notes: null,
        updated_at: now,
      })
      .eq("id", queueId);

    revalidatePath("/admin-panel/proofer/publish");
    return { ok: true, publishUrl };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const now = new Date().toISOString();
    await admin
      .from("proofer_publish_queue")
      .update({
        status: "failed",
        notes: message.slice(0, 2000),
        updated_at: now,
      })
      .eq("id", queueId);

    revalidatePath("/admin-panel/proofer/publish");
    return { ok: false, error: message };
  }
}

async function publishFacebookPost(args: {
  pageId: string;
  pageToken: string;
  caption: string;
  imageUrl: string;
}): Promise<string | null> {
  const { pageId, pageToken, caption, imageUrl } = args;

  if (imageUrl) {
    const params = new URLSearchParams();
    params.set("url", imageUrl);
    if (caption) params.set("caption", caption);
    params.set("access_token", pageToken);

    const endpoint = `/${pageId}/photos`;
    const start = Date.now();
    const res = await fetch(
      `https://graph.facebook.com/${META_GRAPH_VERSION}${endpoint}`,
      { method: "POST", body: params, cache: "no-store", signal: AbortSignal.timeout(30_000) }
    );
    const data = (await res.json()) as { id?: string; post_id?: string; error?: { message?: string } };
    logMetaWrite({
      operation: "publish:facebook",
      metaEndpoint: endpoint,
      requestBody: { url: imageUrl, caption },
      responseStatus: res.status,
      responseBody: data,
      success: res.ok,
      errorMessage: data.error?.message ?? null,
      durationMs: Date.now() - start,
    });
    if (!res.ok) {
      throw new Error(`FB /photos failed: ${res.status} ${JSON.stringify(data)}`);
    }
    const postId = data.post_id ?? data.id ?? null;
    return postId ? `https://www.facebook.com/${postId}` : null;
  }

  if (!caption) {
    throw new Error("Facebook post requires a caption or image_url.");
  }
  const params = new URLSearchParams();
  params.set("message", caption);
  params.set("access_token", pageToken);
  const endpoint = `/${pageId}/feed`;
  const start = Date.now();
  const res = await fetch(
    `https://graph.facebook.com/${META_GRAPH_VERSION}${endpoint}`,
    { method: "POST", body: params, cache: "no-store", signal: AbortSignal.timeout(30_000) }
  );
  const data = (await res.json()) as { id?: string; error?: { message?: string } };
  logMetaWrite({
    operation: "publish:facebook",
    metaEndpoint: endpoint,
    requestBody: { message: caption },
    responseStatus: res.status,
    responseBody: data,
    success: res.ok,
    errorMessage: data.error?.message ?? null,
    durationMs: Date.now() - start,
  });
  if (!res.ok) {
    throw new Error(`FB /feed failed: ${res.status} ${JSON.stringify(data)}`);
  }
  return data.id ? `https://www.facebook.com/${data.id}` : null;
}

async function publishInstagramPost(args: {
  igAccountId: string;
  pageToken: string;
  caption: string;
  imageUrl: string;
  apiBase: string;
}): Promise<string | null> {
  const { igAccountId, pageToken, caption, imageUrl, apiBase } = args;

  if (!imageUrl) {
    throw new Error("Instagram posts require an image_url.");
  }

  const containerParams = new URLSearchParams();
  containerParams.set("image_url", imageUrl);
  if (caption) containerParams.set("caption", caption);
  containerParams.set("access_token", pageToken);

  const containerStart = Date.now();
  const containerRes = await fetch(
    `${apiBase}/${igAccountId}/media`,
    { method: "POST", body: containerParams, cache: "no-store" }
  );
  const container = (await containerRes.json()) as { id?: string; error?: { message?: string } };
  logMetaWrite({
    operation: "publish:instagram",
    metaEndpoint: `/${igAccountId}/media`,
    requestBody: { image_url: imageUrl, caption },
    responseStatus: containerRes.status,
    responseBody: container,
    success: containerRes.ok && !!container.id,
    errorMessage: container.error?.message ?? null,
    durationMs: Date.now() - containerStart,
  });
  if (!containerRes.ok) {
    throw new Error(`IG /media failed: ${containerRes.status} ${JSON.stringify(container)}`);
  }
  const creationId = container.id;
  if (!creationId) {
    throw new Error("IG /media returned no creation id");
  }

  // Even an image container isn't publishable the instant it's created — Meta
  // still has to fetch and process image_url, and media_publish before then
  // fails with "Media ID is not available / not ready" (code 9007). Images
  // usually finish near-instantly (the first status check passes with no wait),
  // but under a slow fetch the race loses the post, so poll like the video paths.
  await waitForContainerReady(creationId, pageToken, "publish:instagram", apiBase);

  const publishedId = await publishIgContainer({
    igAccountId,
    creationId,
    pageToken,
    apiBase,
    operation: "publish:instagram",
    label: "IG",
  });
  if (!publishedId) return null;

  return lookupInstagramPermalink(publishedId, pageToken, apiBase);
}

async function publishInstagramStory(args: {
  igAccountId: string;
  pageToken: string;
  imageUrl: string;
  apiBase: string;
}): Promise<string | null> {
  const { igAccountId, pageToken, imageUrl, apiBase } = args;

  if (!imageUrl) {
    throw new Error("Instagram Stories require an image_url.");
  }

  const storyContainerParams = new URLSearchParams();
  storyContainerParams.set("image_url", imageUrl);
  storyContainerParams.set("media_type", "STORIES");
  storyContainerParams.set("access_token", pageToken);

  const storyContainerStart = Date.now();
  const storyContainerRes = await fetch(
    `${apiBase}/${igAccountId}/media`,
    { method: "POST", body: storyContainerParams, cache: "no-store" }
  );
  const storyContainer = (await storyContainerRes.json()) as { id?: string; error?: { message?: string } };
  logMetaWrite({
    operation: "publish:instagram_story",
    metaEndpoint: `/${igAccountId}/media`,
    requestBody: { image_url: imageUrl, media_type: "STORIES" },
    responseStatus: storyContainerRes.status,
    responseBody: storyContainer,
    success: storyContainerRes.ok && !!storyContainer.id,
    errorMessage: storyContainer.error?.message ?? null,
    durationMs: Date.now() - storyContainerStart,
  });
  if (!storyContainerRes.ok) {
    throw new Error(`IG Story /media failed: ${storyContainerRes.status} ${JSON.stringify(storyContainer)}`);
  }
  const creationId = storyContainer.id;
  if (!creationId) {
    throw new Error("IG Story /media returned no creation id");
  }

  // Same readiness race as the feed image path: wait for Meta to finish
  // ingesting the image before publishing, or media_publish can 400 with
  // "Media ID is not available / not ready" (code 9007).
  await waitForContainerReady(
    creationId,
    pageToken,
    "publish:instagram_story",
    apiBase
  );

  const publishedId = await publishIgContainer({
    igAccountId,
    creationId,
    pageToken,
    apiBase,
    operation: "publish:instagram_story",
    label: "IG Story",
  });
  return publishedId
    ? `https://www.instagram.com/stories/${igAccountId}/${publishedId}/`
    : null;
}

// ── Video publishing ──────────────────────────────────────────────────────
// Video uses entirely different Graph flows than images. Facebook takes a
// hosted file_url on the /videos edge. Instagram publishes video as a Reel
// (feed) or a Story video via the two-step container flow — but the container
// must finish server-side processing before it can be published, so these poll
// waitForContainerReady() between create and publish.

async function publishFacebookVideo(args: {
  pageId: string;
  pageToken: string;
  caption: string;
  videoUrl: string;
}): Promise<string | null> {
  const { pageId, pageToken, caption, videoUrl } = args;
  if (!videoUrl) {
    throw new Error("Facebook video requires a video_url.");
  }

  const params = new URLSearchParams();
  params.set("file_url", videoUrl);
  if (caption) params.set("description", caption);
  params.set("access_token", pageToken);

  const endpoint = `/${pageId}/videos`;
  const start = Date.now();
  const res = await fetch(
    `https://graph.facebook.com/${META_GRAPH_VERSION}${endpoint}`,
    { method: "POST", body: params, cache: "no-store", signal: AbortSignal.timeout(60_000) }
  );
  const data = (await res.json()) as {
    id?: string;
    error?: { message?: string };
  };
  logMetaWrite({
    operation: "publish:facebook_video",
    metaEndpoint: endpoint,
    requestBody: { file_url: videoUrl, description: caption },
    responseStatus: res.status,
    responseBody: data,
    success: res.ok && !!data.id,
    errorMessage: data.error?.message ?? null,
    durationMs: Date.now() - start,
  });
  if (!res.ok) {
    throw new Error(`FB /videos failed: ${res.status} ${JSON.stringify(data)}`);
  }
  return data.id ? `https://www.facebook.com/${pageId}/videos/${data.id}/` : null;
}

async function publishInstagramVideo(args: {
  igAccountId: string;
  pageToken: string;
  caption: string;
  videoUrl: string;
  apiBase: string;
}): Promise<string | null> {
  const { igAccountId, pageToken, caption, videoUrl, apiBase } = args;
  if (!videoUrl) {
    throw new Error("Instagram video posts require a video_url.");
  }

  // 1. Create the Reels container.
  const containerParams = new URLSearchParams();
  containerParams.set("media_type", "REELS");
  containerParams.set("video_url", videoUrl);
  if (caption) containerParams.set("caption", caption);
  containerParams.set("access_token", pageToken);

  const containerStart = Date.now();
  const containerRes = await fetch(
    `${apiBase}/${igAccountId}/media`,
    { method: "POST", body: containerParams, cache: "no-store" }
  );
  const container = (await containerRes.json()) as {
    id?: string;
    error?: { message?: string };
  };
  logMetaWrite({
    operation: "publish:instagram_video",
    metaEndpoint: `/${igAccountId}/media`,
    requestBody: { media_type: "REELS", video_url: videoUrl, caption },
    responseStatus: containerRes.status,
    responseBody: container,
    success: containerRes.ok && !!container.id,
    errorMessage: container.error?.message ?? null,
    durationMs: Date.now() - containerStart,
  });
  if (!containerRes.ok) {
    throw new Error(
      `IG Reel /media failed: ${containerRes.status} ${JSON.stringify(container)}`
    );
  }
  const creationId = container.id;
  if (!creationId) {
    throw new Error("IG Reel /media returned no creation id");
  }

  // 2. Wait for Meta to finish processing the uploaded video.
  await waitForContainerReady(
    creationId,
    pageToken,
    "publish:instagram_video",
    apiBase
  );

  // 3. Publish the processed container.
  const publishedId = await publishIgContainer({
    igAccountId,
    creationId,
    pageToken,
    apiBase,
    operation: "publish:instagram_video",
    label: "IG Reel",
  });
  if (!publishedId) return null;
  return lookupInstagramPermalink(publishedId, pageToken, apiBase);
}

async function publishInstagramStoryVideo(args: {
  igAccountId: string;
  pageToken: string;
  videoUrl: string;
  apiBase: string;
}): Promise<string | null> {
  const { igAccountId, pageToken, videoUrl, apiBase } = args;
  if (!videoUrl) {
    throw new Error("Instagram Stories require a video_url.");
  }

  // 1. Create the Story container (video).
  const containerParams = new URLSearchParams();
  containerParams.set("media_type", "STORIES");
  containerParams.set("video_url", videoUrl);
  containerParams.set("access_token", pageToken);

  const containerStart = Date.now();
  const containerRes = await fetch(
    `${apiBase}/${igAccountId}/media`,
    { method: "POST", body: containerParams, cache: "no-store" }
  );
  const container = (await containerRes.json()) as {
    id?: string;
    error?: { message?: string };
  };
  logMetaWrite({
    operation: "publish:instagram_story_video",
    metaEndpoint: `/${igAccountId}/media`,
    requestBody: { media_type: "STORIES", video_url: videoUrl },
    responseStatus: containerRes.status,
    responseBody: container,
    success: containerRes.ok && !!container.id,
    errorMessage: container.error?.message ?? null,
    durationMs: Date.now() - containerStart,
  });
  if (!containerRes.ok) {
    throw new Error(
      `IG Story video /media failed: ${containerRes.status} ${JSON.stringify(container)}`
    );
  }
  const creationId = container.id;
  if (!creationId) {
    throw new Error("IG Story video /media returned no creation id");
  }

  // 2. Wait for processing.
  await waitForContainerReady(
    creationId,
    pageToken,
    "publish:instagram_story_video",
    apiBase
  );

  // 3. Publish.
  const publishedId = await publishIgContainer({
    igAccountId,
    creationId,
    pageToken,
    apiBase,
    operation: "publish:instagram_story_video",
    label: "IG Story video",
  });
  return publishedId
    ? `https://www.instagram.com/stories/${igAccountId}/${publishedId}/`
    : null;
}
