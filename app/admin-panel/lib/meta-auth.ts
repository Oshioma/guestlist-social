// Meta (Facebook / Instagram) OAuth helpers and Graph API calls used by the
// /api/meta/connect + /api/meta/callback routes and by the server-side
// publishMetaQueueItem action. These are pure functions plus a Supabase
// service-role client factory — the service role is required because the
// `connected_meta_accounts` table has RLS enabled with no policies so tokens
// cannot leak to browser code.

import { createClient } from "@supabase/supabase-js";
import { createHmac, timingSafeEqual } from "crypto";

const GRAPH_VERSION = "v19.0";

// Note: do NOT add pages_read_engagement or instagram_manage_comments
// here. Both are declared in a Use Case on our current Meta app but
// neither is promoted to the "Ready for live" state the OAuth validator
// requires — attempts to request them return "Invalid Scopes" and block
// the entire OAuth flow, even though the app dashboard labels them
// "Ready for testing". If we ever get instagram_manage_comments
// genuinely granted, add it back here and Meta will start returning
// `username` on public-user comments (currently nulled → "private user").
//
// instagram_manage_insights is needed for Business Discovery (looking up
// competitor accounts by handle) and for /{ig-user-id}/tags — every
// discovery feature beyond the owner's own comments depends on it.
export const META_SCOPES = [
  "pages_show_list",
  "pages_manage_posts",
  "instagram_basic",
  "instagram_content_publish",
  "instagram_manage_insights",
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

// Hosts that serve the standalone Proofer at their own root (keep in sync with
// app/proofer/base.ts + middleware.ts). On these hosts the WHOLE OAuth round
// trip must stay on the same domain, or the state/session cookies set here
// aren't present when Meta redirects back — which strands the user. So the
// callback URL is derived from the current host instead of the fixed env value.
const PROOFER_HOSTS = new Set(["postproofer.com", "www.postproofer.com"]);

// The redirect URI to use for a request arriving on `host`. Returns the
// host-local callback for a standalone Proofer host, else undefined so the
// caller falls back to the configured env value (unchanged for the main app).
// NOTE: any host returned here must be registered in the Meta app's Valid OAuth
// Redirect URIs, or Meta blocks the login ("URL blocked").
export function metaRedirectUriForHost(host: string | null | undefined): string | undefined {
  const h = (host ?? "").toLowerCase().split(":")[0];
  if (PROOFER_HOSTS.has(h)) return `https://${h}/api/meta/callback`;
  return undefined;
}

export function metaAuthorizeUrl(state: string, redirectUriOverride?: string): string {
  const { appId, redirectUri: envRedirect } = getMetaConfig();
  const redirectUri = redirectUriOverride || envRedirect;
  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    state,
    response_type: "code",
  });

  // Facebook Login for Business. When a Login configuration id is set, use it
  // instead of a raw scope list. The configuration (created in the Meta app
  // dashboard → Facebook Login for Business → Configurations) defines the
  // requested permissions AND the asset types, so the consent dialog shows a
  // *business asset picker*. This is the ONLY reliable way to reach Pages that
  // are owned by a Business Portfolio / use the New Pages Experience — the
  // classic scope flow below can't see them, which surfaces to the user as
  // "No Pages to control" / "No Facebook Pages found".
  //
  // The default is this workspace's own configuration; it's not a secret (it
  // travels in the browser's OAuth URL). Override it with a different id via
  // env, or set the env var to "off" to fall back to the classic scope flow.
  const DEFAULT_LOGIN_CONFIG_ID = "2158869421359858";
  const envConfigId = process.env.META_SOCIAL_LOGIN_CONFIG_ID;
  const configId =
    envConfigId === "off" ? "" : envConfigId || DEFAULT_LOGIN_CONFIG_ID;
  if (configId) {
    params.set("config_id", configId);
    return `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth?${params.toString()}`;
  }

  // Classic Facebook Login. Works for Pages the user administers directly.
  params.set("scope", META_SCOPES);
  // rerequest forces Meta's consent dialog to re-ask for any scope the user
  // hasn't granted yet. Without it, users who've previously connected with a
  // smaller scope set silently reuse the old grant and new scopes never land
  // on the token.
  params.set("auth_type", "rerequest");
  return `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth?${params.toString()}`;
}

type TokenResponse = {
  accessToken: string;
  expiresIn: number | null;
};

export async function exchangeCodeForUserToken(
  code: string,
  redirectUriOverride?: string
): Promise<TokenResponse> {
  const { appId, appSecret, redirectUri: envRedirect } = getMetaConfig();
  // Must EXACTLY match the redirect_uri used at the authorize step.
  const redirectUri = redirectUriOverride || envRedirect;
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

// ---------------------------------------------------------------------------
// Instagram API *with Instagram Login* — a SEPARATE product from the
// Facebook-Login flow above. This lets a client connect an Instagram
// professional account directly, with NO Facebook Page. It has its own app
// credentials (the "Instagram App ID" / "Instagram App Secret" shown on the
// app's "Set up Instagram business login" screen — these are DIFFERENT from
// META_SOCIAL_APP_ID even when it's the same Meta app), its own OAuth hosts
// (www.instagram.com + api.instagram.com), and its own API host
// (graph.instagram.com). Accounts connected this way are stored in
// connected_meta_accounts with auth_type='instagram_login', and publishing
// hits graph.instagram.com with the Instagram *user* token — never a Page
// token. Do not merge these into the Facebook helpers.
// ---------------------------------------------------------------------------

// Phase 1 scopes: identity + content publishing only. Add
// instagram_business_manage_comments here when interaction/comment
// moderation is extended to Instagram-Login accounts (Phase 2) — it needs
// its own App Review.
export const INSTAGRAM_LOGIN_SCOPES = [
  "instagram_business_basic",
  "instagram_business_content_publish",
].join(",");

// Instagram-Login long-lived tokens last 60 days. graph.instagram.com is
// unversioned for this product (no /vXX.X prefix like graph.facebook.com).
export const INSTAGRAM_GRAPH_BASE = "https://graph.instagram.com";

type InstagramConfig = {
  appId: string;
  appSecret: string;
  redirectUri: string;
};

export function getInstagramConfig(): InstagramConfig {
  const appId = process.env.INSTAGRAM_APP_ID;
  const appSecret = process.env.INSTAGRAM_APP_SECRET;
  const redirectUri = process.env.INSTAGRAM_OAUTH_REDIRECT_URI;
  if (!appId || !appSecret || !redirectUri) {
    throw new Error(
      "Missing INSTAGRAM_APP_ID / INSTAGRAM_APP_SECRET / INSTAGRAM_OAUTH_REDIRECT_URI env vars"
    );
  }
  return { appId, appSecret, redirectUri };
}

export function isInstagramLoginConfigured(): boolean {
  return (
    !!process.env.INSTAGRAM_APP_ID &&
    !!process.env.INSTAGRAM_APP_SECRET &&
    !!process.env.INSTAGRAM_OAUTH_REDIRECT_URI
  );
}

export function instagramAuthorizeUrl(state: string): string {
  const { appId, redirectUri } = getInstagramConfig();
  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    scope: INSTAGRAM_LOGIN_SCOPES,
    response_type: "code",
    state,
    // Force the account chooser rather than silently reusing a prior grant,
    // matching auth_type=rerequest on the Facebook flow.
    force_authentication: "1",
  });
  return `https://www.instagram.com/oauth/authorize?${params.toString()}`;
}

type InstagramShortLivedToken = {
  accessToken: string;
  userId: string;
};

// Exchange the callback `code` for a short-lived Instagram user token + the
// Instagram-scoped user id. POST to api.instagram.com (form-encoded). The
// response shape has varied across API versions — some return the fields at
// the top level, some wrap them in a single-element `data` array — so read
// both defensively.
export async function exchangeInstagramCodeForToken(
  code: string
): Promise<InstagramShortLivedToken> {
  const { appId, appSecret, redirectUri } = getInstagramConfig();
  const body = new URLSearchParams();
  body.set("client_id", appId);
  body.set("client_secret", appSecret);
  body.set("grant_type", "authorization_code");
  body.set("redirect_uri", redirectUri);
  body.set("code", code);

  const res = await fetch("https://api.instagram.com/oauth/access_token", {
    method: "POST",
    body,
    cache: "no-store",
  });
  const raw = (await res.json()) as {
    access_token?: string;
    user_id?: string | number;
    data?: Array<{ access_token?: string; user_id?: string | number }>;
    error_message?: string;
  };
  if (!res.ok) {
    throw new Error(
      `Instagram code exchange failed: ${res.status} ${JSON.stringify(raw)}`
    );
  }
  const first = raw.data?.[0];
  const accessToken = raw.access_token ?? first?.access_token;
  const userId = raw.user_id ?? first?.user_id;
  if (!accessToken || userId == null) {
    throw new Error(
      `Instagram code exchange returned no access_token/user_id: ${JSON.stringify(raw)}`
    );
  }
  return { accessToken, userId: String(userId) };
}

// Upgrade a short-lived Instagram user token to a long-lived one (~60 days).
export async function exchangeForLongLivedInstagramToken(
  shortLivedToken: string
): Promise<TokenResponse> {
  const { appSecret } = getInstagramConfig();
  const url = new URL(`${INSTAGRAM_GRAPH_BASE}/access_token`);
  url.searchParams.set("grant_type", "ig_exchange_token");
  url.searchParams.set("client_secret", appSecret);
  url.searchParams.set("access_token", shortLivedToken);

  const res = await fetch(url.toString(), { cache: "no-store" });
  const data = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
    error?: { message?: string };
  };
  if (!res.ok || !data.access_token) {
    throw new Error(
      `Instagram long-lived exchange failed: ${res.status} ${JSON.stringify(data)}`
    );
  }
  return { accessToken: data.access_token, expiresIn: data.expires_in ?? null };
}

// Refresh a long-lived Instagram token for another ~60 days. The token must
// be at least 24 hours old and not yet expired; once past 60 days there is
// no refresh and the user must reconnect. Driven by the
// /api/cron/refresh-instagram-tokens job.
export async function refreshLongLivedInstagramToken(
  longLivedToken: string
): Promise<TokenResponse> {
  const url = new URL(`${INSTAGRAM_GRAPH_BASE}/refresh_access_token`);
  url.searchParams.set("grant_type", "ig_refresh_token");
  url.searchParams.set("access_token", longLivedToken);

  const res = await fetch(url.toString(), { cache: "no-store" });
  const data = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
    error?: { message?: string };
  };
  if (!res.ok || !data.access_token) {
    throw new Error(
      `Instagram token refresh failed: ${res.status} ${JSON.stringify(data)}`
    );
  }
  return { accessToken: data.access_token, expiresIn: data.expires_in ?? null };
}

// Fetch the connected account's Instagram user id + username for display and
// for the publish-time handle match (account_name).
export async function fetchInstagramLoginProfile(
  userToken: string
): Promise<{ id: string; username: string }> {
  const url = new URL(`${INSTAGRAM_GRAPH_BASE}/me`);
  url.searchParams.set("fields", "user_id,username");
  url.searchParams.set("access_token", userToken);

  const res = await fetch(url.toString(), { cache: "no-store" });
  const data = (await res.json()) as {
    user_id?: string | number;
    id?: string | number;
    username?: string;
    error?: { message?: string };
  };
  if (!res.ok) {
    throw new Error(
      `Instagram /me failed: ${res.status} ${JSON.stringify(data)}`
    );
  }
  const id = data.user_id ?? data.id;
  if (id == null) {
    throw new Error(`Instagram /me returned no user_id: ${JSON.stringify(data)}`);
  }
  return { id: String(id), username: String(data.username ?? "") };
}

// Verify and decode a Meta `signed_request` (used by the deauthorize and
// data-deletion callbacks). Returns the decoded payload, or null if the
// signature doesn't match our Instagram app secret. Format is
// `<base64url signature>.<base64url json payload>`, HMAC-SHA256.
export function parseSignedRequest(
  signedRequest: string
): Record<string, unknown> | null {
  const secret = process.env.INSTAGRAM_APP_SECRET;
  if (!secret) return null;
  const [encodedSig, encodedPayload] = signedRequest.split(".", 2);
  if (!encodedSig || !encodedPayload) return null;

  const toBuf = (s: string) =>
    Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(toBuf(encodedPayload).toString("utf8"));
  } catch {
    return null;
  }

  const expected = createHmac("sha256", secret)
    .update(encodedPayload)
    .digest();
  const actual = toBuf(encodedSig);
  if (
    expected.length !== actual.length ||
    !timingSafeEqual(expected, actual)
  ) {
    return null;
  }
  return payload;
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
