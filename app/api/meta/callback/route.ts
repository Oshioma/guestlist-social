import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  exchangeCodeForUserToken,
  exchangeForLongLivedUserToken,
  fetchInstagramAccountForPage,
  fetchUserPages,
  metaServiceClient,
} from "../../../admin-panel/lib/meta-auth";

// GET /api/meta/callback
//
// Step 2 of the Meta OAuth flow. Verifies the state cookie, exchanges the
// `code` for a short-lived user token, upgrades it to a long-lived token,
// fetches the user's Pages, and for each Page also fetches the linked
// Instagram professional account. All access tokens land in
// `connected_meta_accounts` via the service-role client so they never touch
// browser code.
//
// On success the user is bounced back to /app/proofer/publish?meta=connected.
// On failure they land at /app/proofer/publish?meta_error=<message>.

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const returnedState = url.searchParams.get("state");
  const metaError = url.searchParams.get("error");
  const metaErrorDescription = url.searchParams.get("error_description");

  if (metaError) {
    return redirectWithError(
      req,
      metaErrorDescription || `Meta returned error: ${metaError}`
    );
  }
  if (!code || !returnedState) {
    return redirectWithError(req, "Missing code or state from Meta callback.");
  }

  const cookieStore = await cookies();
  const storedState = cookieStore.get("meta_oauth_state")?.value;
  if (!storedState || storedState !== returnedState) {
    return redirectWithError(req, "OAuth state mismatch — please try again.");
  }
  cookieStore.delete("meta_oauth_state");

  const clientIdPart = storedState.split(":")[0];
  const clientIdNum = Number(clientIdPart);
  if (!clientIdPart || Number.isNaN(clientIdNum)) {
    return redirectWithError(req, "Invalid client id in OAuth state.");
  }

  try {
    const shortLived = await exchangeCodeForUserToken(code);
    const longLived = await exchangeForLongLivedUserToken(
      shortLived.accessToken
    );

    const pages = await fetchUserPages(longLived.accessToken);
    if (pages.length === 0) {
      return redirectWithError(
        req,
        "No Facebook Pages found for this Meta account. Create or join a Page first, then retry."
      );
    }

    const admin = metaServiceClient();
    const now = new Date().toISOString();
    const expiresAt = longLived.expiresIn
      ? new Date(Date.now() + longLived.expiresIn * 1000).toISOString()
      : null;

    let fbCount = 0;
    let igCount = 0;

    for (const page of pages) {
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
      if (fbErr) {
        console.error("meta/callback fb upsert error:", fbErr);
        continue;
      }
      fbCount += 1;

      const ig = await fetchInstagramAccountForPage(page.id, page.access_token);
      if (ig) {
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

    const target = new URL("/admin-panel/proofer/publish", req.url);
    target.searchParams.set("meta", "connected");
    target.searchParams.set("fb", String(fbCount));
    target.searchParams.set("ig", String(igCount));
    return NextResponse.redirect(target);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("meta/callback error:", err);
    return redirectWithError(req, message);
  }
}

function redirectWithError(req: Request, message: string) {
  const target = new URL("/admin-panel/proofer/publish", req.url);
  target.searchParams.set("meta_error", message);
  return NextResponse.redirect(target);
}
