import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { cookies } from "next/headers";

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

  const cookieStore = await cookies();
  cookieStore.set("meta_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });

  // 🔥 DEFINE THIS CLEARLY
  const redirectUri =
    process.env.NODE_ENV === "production"
      ? "https://www.guestlistsocial.com/api/meta/callback"
      : "http://localhost:3000/api/meta/callback";

  const appId = process.env.META_APP_ID;

  if (!appId) {
    return NextResponse.json(
      { error: "Missing META_APP_ID" },
      { status: 500 }
    );
  }

  const scopes = [
    "pages_show_list",
    "pages_read_engagement",
    "pages_manage_posts",
    "instagram_basic",
    "instagram_content_publish",
  ].join(",");

  const authorizeUrl =
    `https://www.facebook.com/v19.0/dialog/oauth` +
    `?client_id=${appId}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${state}` +
    `&scope=${scopes}`;

  // Dump the exact URL we're sending the user to so it's visible in
  // Vercel Runtime Logs when diagnosing OAuth errors ("Feature
  // Unavailable", "Invalid App ID", "URL Blocked", etc.). Nothing in
  // this URL is sensitive — client_id, redirect_uri and scopes are all
  // plaintext query params that Meta receives anyway.
  console.log(
    `[meta/connect] clientId=${clientId} redirectUri=${redirectUri} appId=${appId} url=${authorizeUrl}`
  );

  return NextResponse.redirect(authorizeUrl);
}
