/**
 * Create an ad creative + ad in Meta Ads Manager.
 *
 * This is the final step in the campaign creation flow:
 *   1. Campaign created (meta-campaign-create.ts)
 *   2. Ad set created (meta-campaign-create.ts)
 *   3. Ad creative + ad created (this file)
 *
 * After this, the campaign has everything it needs to deliver.
 */

import { logMetaWrite } from "./meta-write-log";
import { createClient } from "@supabase/supabase-js";

const API_VERSION = "v25.0";
const BASE = `https://graph.facebook.com/${API_VERSION}`;

function getCredentials() {
  const token = process.env.META_ACCESS_TOKEN;
  let accountId = process.env.META_AD_ACCOUNT_ID;
  if (!token || !accountId) {
    throw new Error("Missing META_ACCESS_TOKEN or META_AD_ACCOUNT_ID.");
  }
  if (!accountId.startsWith("act_")) accountId = `act_${accountId}`;
  return { token, accountId };
}

const CTA_MAP: Record<string, string> = {
  learn_more: "LEARN_MORE",
  shop_now: "SHOP_NOW",
  sign_up: "SIGN_UP",
  contact_us: "CONTACT_US",
  book_now: "BOOK_TRAVEL",
  download: "DOWNLOAD",
  get_quote: "GET_QUOTE",
  apply_now: "APPLY_NOW",
  watch_more: "WATCH_MORE",
};

export type CreateMetaAdInput = {
  adsetMetaId: string;
  name: string;
  imageUrl: string;
  headline: string;
  body: string;
  ctaType: string;
  destinationUrl: string;
  pageId?: string;
};

export type CreateMetaAdResult =
  | { ok: true; creativeId: string; adId: string }
  | { ok: false; error: string; step: "creative" | "ad" };

export async function createMetaAd(
  input: CreateMetaAdInput
): Promise<CreateMetaAdResult> {
  const { token, accountId } = getCredentials();

  const ctaEnum = CTA_MAP[input.ctaType] ?? "LEARN_MORE";

  // Resolve page_id — required by object_story_spec. Look up from
  // connected_meta_accounts or fall back to the ad account's pages.
  let pageId = input.pageId ?? null;
  if (!pageId) {
    try {
      const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (sbUrl && sbKey) {
        const supabase = createClient(sbUrl, sbKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data: account } = await supabase
          .from("connected_meta_accounts")
          .select("account_id")
          .eq("platform", "facebook")
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (account?.account_id) {
          pageId = account.account_id;
        }
      }
    } catch { /* fall through */ }
  }
  if (!pageId) {
    // Last resort: fetch pages from the ad account
    try {
      const pagesRes = await fetch(
        `${BASE}/me/accounts?access_token=${token}&limit=1`
      );
      if (pagesRes.ok) {
        const pagesData = await pagesRes.json();
        pageId = pagesData.data?.[0]?.id ?? null;
      }
    } catch { /* fall through */ }
  }
  if (!pageId) {
    return {
      ok: false,
      error: "No Facebook Page found. Connect a Facebook page in Settings first.",
      step: "creative" as const,
    };
  }

  // ── 1. Upload image to ad account to get a permanent hash ──────────
  let imageHash: string | null = null;
  try {
    const imgParams = new URLSearchParams({
      access_token: token,
      url: input.imageUrl,
    });
    const imgRes = await fetch(`${BASE}/${accountId}/adimages`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: imgParams,
    });
    const imgData = await imgRes.json();
    // Response shape: { images: { <filename>: { hash: "abc123" } } }
    const images = imgData.images;
    if (images) {
      const firstKey = Object.keys(images)[0];
      if (firstKey) imageHash = images[firstKey].hash;
    }
  } catch {
    // Fall through — try with image_url as fallback
  }

  // ── 2. Create Ad Creative ─────────────────────────────────────────
  const linkData: Record<string, unknown> = {
    link: input.destinationUrl || "https://example.com",
    message: input.body,
    name: input.headline,
    call_to_action: { type: ctaEnum },
  };

  // Use image_hash if we got one, fall back to picture (external URL)
  if (imageHash) {
    linkData.image_hash = imageHash;
  } else {
    linkData.picture = input.imageUrl;
  }

  // Use the simple creative format that doesn't require object_story_spec
  // or page_id — avoids the Instagram permission error entirely.
  const creativeParams = new URLSearchParams({
    access_token: token,
    name: `${input.name} — creative`,
    title: input.headline,
    body: input.body,
    link_url: input.destinationUrl || "https://example.com",
    call_to_action_type: ctaEnum,
    ...(imageHash ? { image_hash: imageHash } : {}),
  });

  const creativeStart = Date.now();
  const creativeRes = await fetch(`${BASE}/${accountId}/adcreatives`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: creativeParams,
  });
  let creativeData = (await creativeRes.json()) as {
    id?: string;
    error?: { message?: string; error_user_title?: string; error_user_msg?: string };
  };

  logMetaWrite({
    operation: "campaign:create_creative",
    metaEndpoint: `/${accountId}/adcreatives`,
    requestBody: { name: input.name, link_data: linkData },
    responseStatus: creativeRes.status,
    responseBody: creativeData,
    success: !creativeData.error && !!creativeData.id,
    errorMessage: creativeData.error?.message ?? null,
    durationMs: Date.now() - creativeStart,
  });

  if (creativeData.error || !creativeData.id) {
    const errParts = [
      creativeData.error?.message,
      creativeData.error?.error_user_title,
      creativeData.error?.error_user_msg,
    ].filter(Boolean);
    return {
      ok: false,
      error: errParts.join(" — ") || "Meta returned no creative ID.",
      step: "creative",
    };
  }

  // ── 2. Create Ad ──────────────────────────────────────────────────
  const adParams = new URLSearchParams({
    access_token: token,
    name: input.name,
    adset_id: input.adsetMetaId,
    creative: JSON.stringify({ creative_id: creativeData.id }),
    status: "PAUSED",
  });

  const adStart = Date.now();
  const adRes = await fetch(`${BASE}/${accountId}/ads`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: adParams,
  });
  const adData = (await adRes.json()) as {
    id?: string;
    error?: { message?: string; error_user_title?: string; error_user_msg?: string };
  };

  logMetaWrite({
    operation: "campaign:create_ad",
    metaEndpoint: `/${accountId}/ads`,
    requestBody: { name: input.name, adset_id: input.adsetMetaId, creative_id: creativeData.id },
    responseStatus: adRes.status,
    responseBody: adData,
    success: !adData.error && !!adData.id,
    errorMessage: adData.error?.message ?? null,
    durationMs: Date.now() - adStart,
  });

  if (adData.error || !adData.id) {
    const errParts = [
      adData.error?.message,
      adData.error?.error_user_title,
      adData.error?.error_user_msg,
    ].filter(Boolean);
    return {
      ok: false,
      error: errParts.join(" — ") || "Meta returned no ad ID.",
      step: "ad",
    };
  }

  return {
    ok: true,
    creativeId: creativeData.id,
    adId: adData.id,
  };
}
