import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
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
  attachMetaPage,
  type PageCandidate,
} from "../../../admin-panel/lib/meta-attach";
import {
  normalizeHandle,
  facebookPageMatches,
} from "../../../admin-panel/lib/account-match";

// Reaches an external service (OAuth token exchange); the platform default is not a
// safe assumption for it.
export const maxDuration = 30;


// GET /api/meta/callback
//
// Step 2 of the Meta OAuth flow. Verifies the state cookie, exchanges the
// `code` for a long-lived user token, and reads the Pages the login manages
// (each with its linked Instagram account).
//
// From the Teams/admin surface we then attach exactly ONE Page: if the login
// returns a single Page we attach it directly; if it returns several we stash
// the candidates in `pending_meta_connections` and send the user to the chooser
// (/proofer/connect/select) to pick one — no more grab-all. The client's
// fb_page / ig_handle are pinned to whatever is attached.
//
// The portal flow (a client connecting their own account) is unchanged: it
// attaches whatever matches the client's declared handle/Page.

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
    // Exchange with the SAME redirect_uri the authorize step used.
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

    const expiresAt = longLived.expiresIn
      ? new Date(Date.now() + longLived.expiresIn * 1000).toISOString()
      : null;

    // Build the candidate list once: each Page plus its linked Instagram.
    const candidates: PageCandidate[] = [];
    for (const page of pages) {
      const ig = await fetchInstagramAccountForPage(page.id, page.access_token);
      candidates.push({
        id: page.id,
        name: page.name,
        access_token: page.access_token,
        ig_id: ig?.id ?? null,
        ig_username: ig?.username ?? null,
      });
    }

    const isPortal = returnCookie.startsWith("portal:");

    // ── Teams / admin: attach exactly ONE Page (single → direct, many → pick).
    if (!isPortal) {
      if (candidates.length === 1) {
        const res = await attachMetaPage(clientIdNum, candidates[0], expiresAt);
        if (res.error) return redirectError(`Could not save connection: ${res.error}`);
        return redirectSuccess({ meta: "connected", fb: String(res.fb), ig: String(res.ig) });
      }

      const nonce = randomBytes(16).toString("hex");
      const svc = metaServiceClient();
      const { error: pendErr } = await svc.from("pending_meta_connections").insert({
        nonce,
        client_id: clientIdNum,
        return_to: successBase,
        pages: candidates,
        token_expires_at: expiresAt,
      });
      if (pendErr) {
        return redirectError(`Could not prepare the account picker: ${pendErr.message}`);
      }
      cookieStore.set("meta_pick", nonce, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 900,
      });
      return NextResponse.redirect(new URL("/proofer/connect/select", req.url));
    }

    // ── Portal (client connecting their own account): attach what matches the
    // client's declared handle / Page (unchanged behaviour).
    const admin = metaServiceClient();
    const now = new Date().toISOString();
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
    const matchesFbPage = (c: PageCandidate) =>
      !normalizeHandle(fbPage) ||
      facebookPageMatches(fbPage, { account_id: c.id, account_name: c.name });
    const matchesHandle = (username: string) =>
      !wantedHandle || normalizeHandle(username) === wantedHandle;

    let fbCount = 0;
    let igCount = 0;
    const returnedParts: string[] = [];
    for (const c of candidates) {
      returnedParts.push(c.ig_username ? `${c.name} → @${c.ig_username}` : c.name);
      if (matchesFbPage(c)) {
        const { error: fbErr } = await admin.from("connected_meta_accounts").upsert(
          {
            client_id: clientIdNum,
            platform: "facebook",
            account_id: c.id,
            account_name: c.name,
            access_token: c.access_token,
            token_expires_at: expiresAt,
            updated_at: now,
          },
          { onConflict: "client_id,platform,account_id" }
        );
        if (fbErr) console.error("meta/callback fb upsert error:", fbErr);
        else fbCount += 1;
      }
      if (c.ig_id && c.ig_username && matchesHandle(c.ig_username)) {
        const { error: igErr } = await admin.from("connected_meta_accounts").upsert(
          {
            client_id: clientIdNum,
            platform: "instagram",
            account_id: c.ig_id,
            account_name: c.ig_username,
            access_token: c.access_token,
            token_expires_at: expiresAt,
            updated_at: now,
          },
          { onConflict: "client_id,platform,account_id" }
        );
        if (!igErr) igCount += 1;
      }
    }

    return redirectSuccess({
      meta: "connected",
      fb: String(fbCount),
      ig: String(igCount),
      pages: returnedParts.join("|").slice(0, 1500),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("meta/callback error:", err);
    return redirectError(message);
  }
}
