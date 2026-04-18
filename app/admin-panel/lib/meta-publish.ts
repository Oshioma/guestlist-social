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

export async function publishMetaQueueItem(
  queueId: string
): Promise<PublishResult> {
  if (!queueId) {
    return { ok: false, error: "Queue item id is required." };
  }

  const admin = metaServiceClient();

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
    return { ok: false, error: `post lookup: ${postErr.message}` };
  }
  if (!post) {
    return { ok: false, error: "Post not found." };
  }
  if (post.status !== "proofed" && post.status !== "approved") {
    return {
      ok: false,
      error: "Only proofed posts can be published.",
    };
  }

  // 3. Connected account
  const platform = queueItem.platform as "facebook" | "instagram";
  const { data: account, error: accountErr } = await admin
    .from("connected_meta_accounts")
    .select("account_id, access_token, account_name")
    .eq("client_id", post.client_id)
    .eq("platform", platform)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (accountErr) {
    return { ok: false, error: `account lookup: ${accountErr.message}` };
  }
  if (!account) {
    return {
      ok: false,
      error: `No connected ${platform} account for this client. Click Connect Meta first.`,
    };
  }

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
