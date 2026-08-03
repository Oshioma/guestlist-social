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
import { META_GRAPH_VERSION, metaServiceClient } from "./meta-auth";
import { logMetaWrite } from "../../../lib/meta-write-log";

type PublishResult =
  | { ok: true; publishUrl: string | null }
  | { ok: false; error: string };

type ConnectedAccount = {
  account_id: string;
  access_token: string;
  account_name: string | null;
};

type ResolveResult =
  | { ok: true; account: ConnectedAccount }
  | { ok: false; error: string };

// Normalize a handle/username for comparison: lower-case, trimmed, no
// leading "@". "@Organzibar " and "organzibar" compare equal.
function normalizeHandle(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/^@+/, "").toLowerCase();
}

// Pick the ONE account a post is allowed to publish to, and refuse rather
// than guess. The binding key is the client's declared handle ("the handle
// the post was written for"):
//
//   Instagram — publish only to the connected account whose username
//     (account_name, captured from Graph at connect time) matches the
//     client's ig_handle. If a handle is set and nothing matches, block.
//     If no handle is set, allow only when there's exactly one connected
//     account (unambiguous); otherwise block.
//   Facebook — publish only to the connected Page whose name (account_name)
//     or id (account_id) matches the client's declared `fb_page`. If a Page
//     is declared and nothing matches, block. If none is declared, allow
//     only when there's exactly one connected Page; otherwise block.
//
// Blocking returns a human-readable reason that the caller stashes in the
// queue row's notes so the operator can see *why* it didn't go out.
function resolveTargetAccount(args: {
  accounts: ConnectedAccount[];
  platform: "facebook" | "instagram";
  handle: string | null;
  fbPage: string | null;
  clientName: string;
}): ResolveResult {
  const { accounts, platform, handle, fbPage, clientName } = args;
  const connectedList = accounts
    .map((a) => a.account_name || a.account_id)
    .join(", ");

  if (platform === "instagram") {
    const wanted = normalizeHandle(handle);
    if (wanted) {
      const matches = accounts.filter(
        (a) => normalizeHandle(a.account_name) === wanted
      );
      if (matches.length === 1) return { ok: true, account: matches[0] };
      if (matches.length === 0) {
        return {
          ok: false,
          error:
            `Blocked: no connected Instagram account matches @${wanted} for "${clientName}". ` +
            `Connected: ${connectedList || "none"}. Not publishing to avoid posting to the wrong account. ` +
            `Fix the client's Instagram handle or connect the right account.`,
        };
      }
      return {
        ok: false,
        error:
          `Blocked: ${matches.length} connected Instagram accounts match @${wanted} for "${clientName}". ` +
          `Remove the duplicate connection before publishing.`,
      };
    }
    // No handle declared — only safe when there's a single account.
    if (accounts.length === 1) return { ok: true, account: accounts[0] };
    return {
      ok: false,
      error:
        `Blocked: "${clientName}" has ${accounts.length} connected Instagram accounts (${connectedList}) ` +
        `and no Instagram handle set to identify the right one. Set the client's Instagram handle so posts ` +
        `only go to the intended account.`,
    };
  }

  // Facebook: match the declared Page against the connected Page's name or id.
  const wantedPage = normalizeHandle(fbPage);
  if (wantedPage) {
    const matches = accounts.filter(
      (a) =>
        normalizeHandle(a.account_name) === wantedPage ||
        (a.account_id ?? "").trim().toLowerCase() === wantedPage
    );
    if (matches.length === 1) return { ok: true, account: matches[0] };
    if (matches.length === 0) {
      return {
        ok: false,
        error:
          `Blocked: no connected Facebook Page matches "${fbPage}" for "${clientName}". ` +
          `Connected: ${connectedList || "none"}. Not publishing to avoid posting to the wrong account. ` +
          `Fix the client's Facebook Page or connect the right Page.`,
      };
    }
    return {
      ok: false,
      error:
        `Blocked: ${matches.length} connected Facebook Pages match "${fbPage}" for "${clientName}". ` +
        `Remove the duplicate connection before publishing.`,
    };
  }
  // No Page declared — only safe when there's a single connected Page.
  if (accounts.length === 1) return { ok: true, account: accounts[0] };
  return {
    ok: false,
    error:
      `Blocked: "${clientName}" has ${accounts.length} connected Facebook Pages (${connectedList}) ` +
      `and no Facebook Page set to identify the right one. Set the client's Facebook Page so posts ` +
      `only go to the intended account.`,
  };
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
  const clientName: string = client?.name || "this client";
  const clientHandle: string | null = client?.ig_handle ?? null;
  const clientFbPage: string | null = client?.fb_page ?? null;

  const { data: accounts, error: accountErr } = await admin
    .from("connected_meta_accounts")
    .select("account_id, access_token, account_name")
    .eq("client_id", post.client_id)
    .eq("platform", platform)
    .order("updated_at", { ascending: false });

  if (accountErr) {
    await noteScheduledIssue(admin, queueId, `account lookup: ${accountErr.message}`);
    return { ok: false, error: `account lookup: ${accountErr.message}` };
  }
  if (!accounts || accounts.length === 0) {
    const msg = `No connected ${platform} account for this client. Click "Connect Meta" to reconnect.`;
    await noteScheduledIssue(admin, queueId, msg);
    return { ok: false, error: msg };
  }

  const resolved = resolveTargetAccount({
    accounts,
    platform,
    handle: clientHandle,
    fbPage: clientFbPage,
    clientName,
  });
  if (!resolved.ok) {
    await noteScheduledIssue(admin, queueId, resolved.error);
    return { ok: false, error: resolved.error };
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

  // 4. Publish
  try {
    let publishUrl: string | null = null;

    if (platform === "facebook") {
      publishUrl = await publishFacebookPost({
        pageId: account.account_id,
        pageToken: account.access_token,
        caption,
        imageUrl,
      });
    } else if (isStory) {
      publishUrl = await publishInstagramStory({
        igAccountId: account.account_id,
        pageToken: account.access_token,
        imageUrl,
      });
    } else {
      publishUrl = await publishInstagramPost({
        igAccountId: account.account_id,
        pageToken: account.access_token,
        caption,
        imageUrl,
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
      { method: "POST", body: params, cache: "no-store" }
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
    { method: "POST", body: params, cache: "no-store" }
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
}): Promise<string | null> {
  const { igAccountId, pageToken, caption, imageUrl } = args;

  if (!imageUrl) {
    throw new Error("Instagram posts require an image_url.");
  }

  const containerParams = new URLSearchParams();
  containerParams.set("image_url", imageUrl);
  if (caption) containerParams.set("caption", caption);
  containerParams.set("access_token", pageToken);

  const containerStart = Date.now();
  const containerRes = await fetch(
    `https://graph.facebook.com/${META_GRAPH_VERSION}/${igAccountId}/media`,
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

  const publishParams = new URLSearchParams();
  publishParams.set("creation_id", creationId);
  publishParams.set("access_token", pageToken);

  const publishStart = Date.now();
  const publishRes = await fetch(
    `https://graph.facebook.com/${META_GRAPH_VERSION}/${igAccountId}/media_publish`,
    { method: "POST", body: publishParams, cache: "no-store" }
  );
  const publishData = (await publishRes.json()) as { id?: string; error?: { message?: string } };
  logMetaWrite({
    operation: "publish:instagram",
    metaEndpoint: `/${igAccountId}/media_publish`,
    requestBody: { creation_id: creationId },
    responseStatus: publishRes.status,
    responseBody: publishData,
    success: publishRes.ok && !!publishData.id,
    errorMessage: publishData.error?.message ?? null,
    durationMs: Date.now() - publishStart,
  });
  if (!publishRes.ok) {
    throw new Error(`IG /media_publish failed: ${publishRes.status} ${JSON.stringify(publishData)}`);
  }
  if (!publishData.id) return null;

  // Try to look up the permalink; fall back to null silently on failure.
  try {
    const permalinkUrl = new URL(
      `https://graph.facebook.com/${META_GRAPH_VERSION}/${publishData.id}`
    );
    permalinkUrl.searchParams.set("fields", "permalink");
    permalinkUrl.searchParams.set("access_token", pageToken);
    const permalinkRes = await fetch(permalinkUrl.toString(), {
      cache: "no-store",
    });
    if (permalinkRes.ok) {
      const permalinkData = (await permalinkRes.json()) as {
        permalink?: string;
      };
      if (permalinkData.permalink) return permalinkData.permalink;
    }
  } catch {
    // fall through
  }
  return null;
}

async function publishInstagramStory(args: {
  igAccountId: string;
  pageToken: string;
  imageUrl: string;
}): Promise<string | null> {
  const { igAccountId, pageToken, imageUrl } = args;

  if (!imageUrl) {
    throw new Error("Instagram Stories require an image_url.");
  }

  const storyContainerParams = new URLSearchParams();
  storyContainerParams.set("image_url", imageUrl);
  storyContainerParams.set("media_type", "STORIES");
  storyContainerParams.set("access_token", pageToken);

  const storyContainerStart = Date.now();
  const storyContainerRes = await fetch(
    `https://graph.facebook.com/${META_GRAPH_VERSION}/${igAccountId}/media`,
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

  const storyPublishParams = new URLSearchParams();
  storyPublishParams.set("creation_id", creationId);
  storyPublishParams.set("access_token", pageToken);

  const storyPublishStart = Date.now();
  const storyPublishRes = await fetch(
    `https://graph.facebook.com/${META_GRAPH_VERSION}/${igAccountId}/media_publish`,
    { method: "POST", body: storyPublishParams, cache: "no-store" }
  );
  const publishData = (await storyPublishRes.json()) as { id?: string; error?: { message?: string } };
  logMetaWrite({
    operation: "publish:instagram_story",
    metaEndpoint: `/${igAccountId}/media_publish`,
    requestBody: { creation_id: creationId },
    responseStatus: storyPublishRes.status,
    responseBody: publishData,
    success: storyPublishRes.ok && !!publishData.id,
    errorMessage: publishData.error?.message ?? null,
    durationMs: Date.now() - storyPublishStart,
  });
  if (!storyPublishRes.ok) {
    throw new Error(
      `IG Story /media_publish failed: ${storyPublishRes.status} ${JSON.stringify(publishData)}`
    );
  }
  return publishData.id
    ? `https://www.instagram.com/stories/${igAccountId}/${publishData.id}/`
    : null;
}
