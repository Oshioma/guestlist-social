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

  // ── 1. Create Ad Creative ─────────────────────────────────────────
  const linkData: Record<string, unknown> = {
    link: input.destinationUrl,
    message: input.body,
    name: input.headline,
    image_url: input.imageUrl,
    call_to_action: { type: ctaEnum },
  };

  const creativeParams = new URLSearchParams({
    access_token: token,
    name: `${input.name} — creative`,
    object_story_spec: JSON.stringify({
      link_data: linkData,
      ...(input.pageId ? { page_id: input.pageId } : {}),
    }),
  });

  const creativeStart = Date.now();
  const creativeRes = await fetch(`${BASE}/${accountId}/adcreatives`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: creativeParams,
  });
  const creativeData = (await creativeRes.json()) as {
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
