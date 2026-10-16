import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  exchangeInstagramCodeForToken,
  exchangeForLongLivedInstagramToken,
  fetchInstagramLoginProfile,
  metaServiceClient,
} from "../../../admin-panel/lib/meta-auth";
import { normalizeHandle } from "../../../admin-panel/lib/account-match";

// Reaches an external service (OAuth token exchange); the platform default is not a
// safe assumption for it.
export const maxDuration = 30;


// GET /api/instagram/callback
//
// Step 2 of the Instagram Business Login flow. Verifies the state cookie,
// exchanges the `code` for a short-lived Instagram user token, upgrades it to
// a long-lived (~60 day) token, reads the account's user id + username, and
// stores it in connected_meta_accounts with auth_type='instagram_login'. The
// long-lived token is what publishing and the refresh cron use.
//
// No Facebook Page is involved — this is the whole point of the flow.

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const returnedState = url.searchParams.get("state");
  const igError = url.searchParams.get("error");
  const igErrorDescription = url.searchParams.get("error_description");

  const cookieStore = await cookies();
  const storedState = cookieStore.get("ig_oauth_state")?.value;
  const returnCookie = cookieStore.get("ig_oauth_return")?.value ?? "";
  cookieStore.delete("ig_oauth_return");

  // Same return-target convention as the Facebook callback: "portal:<id>"
  // sends the client back to the portal connect page; a leading "/" is an
  // admin-panel path; otherwise default to the publish page.
  const successBase = (() => {
    if (returnCookie.startsWith("portal:")) {
      return `/portal/${returnCookie.split(":")[1]}/connect`;
    }
    if (returnCookie.startsWith("/")) {
      const path = returnCookie.split(":")[0];
      if (path) return path;
    }
    return "/admin-panel/proofer/publish";
  })();

  function redirectSuccess(extra: Record<string, string>) {
    const target = new URL(successBase, req.url);
    for (const [k, v] of Object.entries(extra)) target.searchParams.set(k, v);
    return NextResponse.redirect(target);
  }

  function redirectError(message: string) {
    const target = new URL(successBase, req.url);
    target.searchParams.set("meta_error", message);
    return NextResponse.redirect(target);
  }

  if (igError) {
    return redirectError(
      igErrorDescription || `Instagram returned error: ${igError}`
    );
  }
  if (!code || !returnedState) {
    return redirectError("Missing code or state from Instagram callback.");
  }
  if (!storedState || storedState !== returnedState) {
    cookieStore.delete("ig_oauth_state");
    return redirectError("OAuth state mismatch — please try again.");
  }
  cookieStore.delete("ig_oauth_state");

  const clientIdPart = storedState.split(":")[0];
  const clientIdNum = Number(clientIdPart);
  if (!clientIdPart || Number.isNaN(clientIdNum)) {
    return redirectError("Invalid client id in OAuth state.");
  }

  try {
    const shortLived = await exchangeInstagramCodeForToken(code);
    const longLived = await exchangeForLongLivedInstagramToken(
      shortLived.accessToken
    );
    const profile = await fetchInstagramLoginProfile(longLived.accessToken);

    const admin = metaServiceClient();

    // Guard against connecting the WRONG Instagram. Instagram OAuth silently
    // reuses whatever account is already logged into the browser, so clicking
    // "Connect Instagram" for one client can attach the operator's own (or
    // another client's) Instagram. If the client has a declared handle
    // (ig_handle), refuse to save a login whose username doesn't match it —
    // the same pinning the publisher uses to never post to the wrong account.
    // (defensive select: ig_handle should exist, but never break connect on it.)
    const { data: clientRow } = await admin
      .from("clients")
      .select("ig_handle")
      .eq("id", clientIdNum)
      .maybeSingle();
    const declaredHandle = normalizeHandle(
      (clientRow?.ig_handle as string | null) ?? null
    );
    const connectedHandle = normalizeHandle(profile.username);
    if (declaredHandle && connectedHandle && declaredHandle !== connectedHandle) {
      return redirectError(
        `You connected @${profile.username}, but this account's Instagram handle is ` +
          `@${declaredHandle}. Nothing was saved. You were probably still logged into a ` +
          `different Instagram — log out of Instagram (or use a private/incognito window), ` +
          `then click Connect Instagram again and sign in as @${declaredHandle}.`
      );
    }

    const now = new Date().toISOString();
    const expiresAt = longLived.expiresIn
      ? new Date(Date.now() + longLived.expiresIn * 1000).toISOString()
      : null;

    const { error: upsertErr } = await admin
      .from("connected_meta_accounts")
      .upsert(
        {
          client_id: clientIdNum,
          platform: "instagram",
          account_id: profile.id,
          account_name: profile.username,
          access_token: longLived.accessToken,
          token_expires_at: expiresAt,
          auth_type: "instagram_login",
          updated_at: now,
        },
        { onConflict: "client_id,platform,account_id" }
      );
    if (upsertErr) {
      console.error("instagram/callback upsert error:", upsertErr);
      return redirectError(`Could not save connection: ${upsertErr.message}`);
    }

    return redirectSuccess({ meta: "connected", ig: "1" });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("instagram/callback error:", err);
    return redirectError(message);
  }
}
