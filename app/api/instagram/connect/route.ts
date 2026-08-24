import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import { instagramAuthorizeUrl } from "../../../admin-panel/lib/meta-auth";

// Reaches an external service (OAuth token exchange); the platform default is not a
// safe assumption for it.
export const maxDuration = 30;


// GET /api/instagram/connect?clientId=<id>&returnTo=<portal|/path>
//
// Step 1 of the Instagram *Business Login* flow — the no-Facebook path for
// clients who only have an Instagram professional account. Mirrors
// /api/meta/connect but uses the Instagram app credentials and Instagram's
// OAuth host. Writes a signed state cookie (clientId + nonce) that the
// callback verifies before storing any token, so we can't be tricked into
// attaching an account to the wrong client.
//
// Uses a DEDICATED state cookie (ig_oauth_state) separate from the Facebook
// flow's meta_oauth_state so the two flows can't clobber each other.

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
  cookieStore.set("ig_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  if (returnTo) {
    cookieStore.set("ig_oauth_return", `${returnTo}:${clientId}`, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 600,
    });
  }

  try {
    const authorizeUrl = instagramAuthorizeUrl(state);
    console.log(
      `[instagram/connect] clientId=${clientId} redirectUri=${process.env.INSTAGRAM_OAUTH_REDIRECT_URI} appId=${process.env.INSTAGRAM_APP_ID} url=${authorizeUrl}`
    );
    return NextResponse.redirect(authorizeUrl);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[instagram/connect] config error: ${message}`);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
