import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  exchangeCodeForUserToken,
  exchangeForLongLivedUserToken,
  fetchInstagramAccountForPage,
  fetchUserPages,
  metaServiceClient,
  metaRedirectUriForHost,
} from "../../../admin-panel/lib/meta-auth";
import {
  normalizeHandle,
  facebookPageMatches,
} from "../../../admin-panel/lib/account-match";

// GET /api/meta/callback
//
// Step 2 of the Meta OAuth flow. Verifies the state cookie, exchanges the
// `code` for a short-lived user token, upgrades it to a long-lived token,
// fetches the user's Pages, and for each Page also fetches the linked
// Instagram professional account. All access tokens land in
// `connected_meta_accounts` via the service-role client so they never touch
// browser code.
//
// On success redirects to the portal connect page (if returnTo=portal cookie
// is set) or /admin-panel/proofer/publish (default).

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const returnedState = url.searchParams.get("state");
  const metaError = url.searchParams.get("error");
  const metaErrorDescription = url.searchParams.get("error_description");

  const cookieStore = await cookies();
  const storedState = cookieStore.get("meta_oauth_state")?.value;
  const returnCookie = cookieStore.get("meta_oauth_return")?.value ?? "";
  cookieStore.delete("meta_oauth_return");

  // The connect route writes `${returnTo}:${clientId}` into the cookie.
  // "portal:<clientId>" is the old portal-specific shorthand; anything
  // starting with "/" is an arbitrary admin-panel path like
  // "/app/interaction" that we should send the user back to.
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
  const errorBase = successBase;

  function redirectSuccess(extra: Record<string, string>) {
    const target = new URL(successBase, req.url);
    for (const [k, v] of Object.entries(extra)) target.searchParams.set(k, v);
    return NextResponse.redirect(target);
  }

  function redirectError(message: string) {
    const target = new URL(errorBase, req.url);
    target.searchParams.set("meta_error", message);
    return NextResponse.redirect(target);
  }

  if (metaError) {
    return redirectError(metaErrorDescription || `Meta returned error: ${metaError}`);
  }
  if (!code || !returnedState) {
    return redirectError("Missing code or state from Meta callback.");
  }
  if (!storedState || storedState !== returnedState) {
    cookieStore.delete("meta_oauth_state");
    return redirectError("OAuth state mismatch — please try again.");
  }
  cookieStore.delete("meta_oauth_state");

  const clientIdPart = storedState.split(":")[0];
  const clientIdNum = Number(clientIdPart);
  if (!clientIdPart || Number.isNaN(clientIdNum)) {
    return redirectError("Invalid client id in OAuth state.");
  }

  try {
    // Exchange with the SAME redirect_uri the authorize step used — on a
    // standalone Proofer host that's this host, not the env default.
    const hostRedirect = metaRedirectUriForHost(new URL(req.url).host);
    const shortLived = await exchangeCodeForUserToken(code, hostRedirect);
    const longLived = await exchangeForLongLivedUserToken(shortLived.accessToken);

    const pages = await fetchUserPages(longLived.accessToken);
    if (pages.length === 0) {
      return redirectError(
        "Facebook returned no Pages for this login, so there's nothing to connect. " +
          "If this account only has Instagram and no Facebook Page, use \"Connect " +
          "Instagram\" instead — it needs no Facebook. Otherwise this usually means your " +
          "Pages are owned by a Business Portfolio / use the New Pages Experience, which " +
          'the classic login can\'t read (you\'ll see "No Pages to control" on Facebook). ' +
          "Grant this app access to the Page in Meta Business Settings, or switch on " +
          "Business Login (set META_SOCIAL_LOGIN_CONFIG_ID), then retry."
      );
    }

    const admin = metaServiceClient();
    const now = new Date().toISOString();
    const expiresAt = longLived.expiresIn
      ? new Date(Date.now() + longLived.expiresIn * 1000).toISOString()
      : null;

    // Only attach the account(s) this client actually declares. When a login
    // manages a whole portfolio, attaching every Page under one client is the
    // pollution that put the wrong accounts everywhere — so if the client has
    // declared its Instagram handle / Facebook Page, keep only the matching
    // ones. With nothing declared yet, attach everything so the operator can
    // still discover and pick, then set the handle/Page.
    let handle: string | null = null;
    let fbPage: string | null = null;
    const clientRow = await admin
      .from("clients")
      .select("ig_handle, fb_page")
      .eq("id", clientIdNum)
      .maybeSingle();
    if (clientRow.error) {
      const fb = await admin
        .from("clients")
        .select("ig_handle")
        .eq("id", clientIdNum)
        .maybeSingle();
      handle = (fb.data?.ig_handle as string | null) ?? null;
    } else {
      handle = (clientRow.data?.ig_handle as string | null) ?? null;
      fbPage = (clientRow.data?.fb_page as string | null) ?? null;
    }
    const wantedHandle = normalizeHandle(handle);
    const matchesFbPage = (p: { id: string; name: string }) =>
      !normalizeHandle(fbPage) ||
      facebookPageMatches(fbPage, { account_id: p.id, account_name: p.name });
    const matchesHandle = (username: string) =>
      !wantedHandle || normalizeHandle(username) === wantedHandle;

    let fbCount = 0;
    let igCount = 0;
    // Diagnostic: exactly what Facebook handed back for this login (the whole
    // portfolio), so the connect banner can show what was available even when
    // we only attach the matching one.
    const returnedParts: string[] = [];

    for (const page of pages) {
      const ig = await fetchInstagramAccountForPage(page.id, page.access_token);
      returnedParts.push(ig?.username ? `${page.name} → @${ig.username}` : page.name);

      if (matchesFbPage(page)) {
        const { error: fbErr } = await admin
          .from("connected_meta_accounts")
          .upsert(
            {
              client_id: clientIdNum,
              platform: "facebook",
              account_id: page.id,
              account_name: page.name,
              access_token: page.access_token,
              token_expires_at: expiresAt,
              updated_at: now,
            },
            { onConflict: "client_id,platform,account_id" }
          );
        if (fbErr) console.error("meta/callback fb upsert error:", fbErr);
        else fbCount += 1;
      }

      if (ig && matchesHandle(ig.username)) {
        const { error: igErr } = await admin
          .from("connected_meta_accounts")
          .upsert(
            {
              client_id: clientIdNum,
              platform: "instagram",
              account_id: ig.id,
              account_name: ig.username,
              // Instagram Graph API publishing uses the parent Page's token.
              access_token: page.access_token,
              token_expires_at: expiresAt,
              updated_at: now,
            },
            { onConflict: "client_id,platform,account_id" }
          );
        if (!igErr) igCount += 1;
      }
    }

    const returned = returnedParts.join("|");

    return redirectSuccess({
      meta: "connected",
      fb: String(fbCount),
      ig: String(igCount),
      pages: returned.slice(0, 1500),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("meta/callback error:", err);
    return redirectError(message);
  }
}
