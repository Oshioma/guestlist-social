// Meta (Facebook / Instagram) OAuth helpers and Graph API calls used by the
// /api/meta/connect + /api/meta/callback routes and by the server-side
// publishMetaQueueItem action. These are pure functions plus a Supabase
// service-role client factory — the service role is required because the
// `connected_meta_accounts` table has RLS enabled with no policies so tokens
// cannot leak to browser code.

import { createClient } from "@supabase/supabase-js";

const GRAPH_VERSION = "v19.0";

export const META_SCOPES = [
  "pages_show_list",
  "pages_manage_posts",
  "instagram_basic",
  "instagram_content_publish",
  "business_management",
].join(",");

type MetaConfig = {
  appId: string;
  appSecret: string;
  redirectUri: string;
};

export function getMetaConfig(): MetaConfig {
  const appId = process.env.META_SOCIAL_APP_ID;
  const appSecret = process.env.META_SOCIAL_APP_SECRET;
  const redirectUri = process.env.META_SOCIAL_OAUTH_REDIRECT_URI;
  if (!appId || !appSecret || !redirectUri) {
    throw new Error(
      "Missing META_SOCIAL_APP_ID / META_SOCIAL_APP_SECRET / META_SOCIAL_OAUTH_REDIRECT_URI env vars"
    );
  }
  return { appId, appSecret, redirectUri };
}

export function metaAuthorizeUrl(state: string): string {
  const { appId, redirectUri } = getMetaConfig();
  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    state,
    scope: META_SCOPES,
    response_type: "code",
  });
  return `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth?${params.toString()}`;
}

type TokenResponse = {
  accessToken: string;
  expiresIn: number | null;
};

export async function exchangeCodeForUserToken(
  code: string
): Promise<TokenResponse> {
  const { appId, appSecret, redirectUri } = getMetaConfig();
  const url = new URL(
    `https://graph.facebook.com/${GRAPH_VERSION}/oauth/access_token`
  );
  url.searchParams.set("client_id", appId);
  url.searchParams.set("client_secret", appSecret);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("code", code);

  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Meta code exchange failed: ${res.status} ${body}`);
  }
  const data = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
  };
  if (!data.access_token) {
    throw new Error("Meta code exchange returned no access_token");
  }
  return {
    accessToken: data.access_token,
    expiresIn: data.expires_in ?? null,
  };
}

export async function exchangeForLongLivedUserToken(
  shortLivedToken: string
): Promise<TokenResponse> {
  const { appId, appSecret } = getMetaConfig();
  const url = new URL(
    `https://graph.facebook.com/${GRAPH_VERSION}/oauth/access_token`
  );
  url.searchParams.set("grant_type", "fb_exchange_token");
  url.searchParams.set("client_id", appId);
  url.searchParams.set("client_secret", appSecret);
  url.searchParams.set("fb_exchange_token", shortLivedToken);

  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `Meta long-lived token exchange failed: ${res.status} ${body}`
    );
  }
  const data = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
  };
  if (!data.access_token) {
    throw new Error("Meta long-lived exchange returned no access_token");
  }
  return {
    accessToken: data.access_token,
    expiresIn: data.expires_in ?? null,
  };
}

export type MetaPage = {
  id: string;
  name: string;
  access_token: string;
};

export async function fetchUserPages(userToken: string): Promise<MetaPage[]> {
  const url = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/me/accounts`);
  url.searchParams.set("access_token", userToken);
  url.searchParams.set("fields", "id,name,access_token");
  url.searchParams.set("limit", "200");

  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Meta /me/accounts failed: ${res.status} ${body}`);
  }
  const data = (await res.json()) as { data?: MetaPage[] };
  return data.data ?? [];
}

export async function fetchInstagramAccountForPage(
  pageId: string,
  pageToken: string
): Promise<{ id: string; username: string } | null> {
  const url = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/${pageId}`);
  url.searchParams.set("fields", "instagram_business_account{id,username}");
  url.searchParams.set("access_token", pageToken);

  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) {
    // Not all pages have linked IG accounts — swallow and move on.
    return null;
  }
  const data = (await res.json()) as {
    instagram_business_account?: { id?: string; username?: string };
  };
  const ig = data.instagram_business_account;
  if (!ig?.id) return null;
  return { id: String(ig.id), username: String(ig.username ?? "") };
}

// Service-role Supabase client. The connected_meta_accounts table has RLS
// with no policies, so this is the ONLY way to read/write connected
// accounts. Never import this from browser code.
export function metaServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
    );
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export const META_GRAPH_VERSION = GRAPH_VERSION;
