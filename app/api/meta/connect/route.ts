import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import { metaAuthorizeUrl } from "../../../admin-panel/lib/meta-auth";

// GET /api/meta/connect?clientId=<id>
//
// Step 1 of the Meta OAuth flow. Generates a signed state cookie containing
// the client id + random nonce, then redirects the user to Meta's OAuth
// dialog. The callback route verifies the cookie before exchanging the
// code, so we can't be tricked into storing tokens against the wrong client.
//
// All Meta credentials come from META_SOCIAL_APP_ID / META_SOCIAL_APP_SECRET
// / META_SOCIAL_OAUTH_REDIRECT_URI — a dedicated app separate from the
// marketing/ads app that uses META_APP_ID in this same codebase. Do not
// swap back to META_APP_ID or the callback will try to exchange the code
// against a different app's secret and fail.

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const clientId = searchParams.get("clientId");

  if (!clientId) {
    return NextResponse.json(
      { error: "clientId query param is required" },
      { status: 400 }
    );
  }

  const nonce = randomBytes(16).toString("hex");
  const state = `${clientId}:${nonce}`;

  const returnTo = searchParams.get("returnTo") ?? "";

  const cookieStore = await cookies();
  cookieStore.set("meta_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  if (returnTo) {
    cookieStore.set("meta_oauth_return", `${returnTo}:${clientId}`, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 600,
    });
  }

  try {
    const authorizeUrl = metaAuthorizeUrl(state);
    // Dump the exact URL we're sending the user to so it's visible in
    // Vercel Runtime Logs when diagnosing OAuth errors ("Feature
    // Unavailable", "Invalid App ID", "URL Blocked", etc.). Nothing in
    // this URL is sensitive — client_id, redirect_uri and scopes are
    // all plaintext query params that Meta receives anyway.
    console.log(
      `[meta/connect] clientId=${clientId} redirectUri=${process.env.META_SOCIAL_OAUTH_REDIRECT_URI} appId=${process.env.META_SOCIAL_APP_ID} url=${authorizeUrl}`
    );
    return NextResponse.redirect(authorizeUrl);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[meta/connect] config error: ${message}`);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
