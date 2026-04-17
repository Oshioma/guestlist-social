// /auth/callback — PKCE code exchange for email verification, password
// recovery, and any OAuth provider flow. Supabase redirects here with a `code`
// query param; we swap it for a session on this domain.
//
//   - type=recovery → land on /reset-password (user is now recovery-authed
//     and can call updateUser({ password }))
//   - anything else → land on /post-login?next=<safeNext> so the role
//     dispatcher figures out where the user belongs.

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSafeNext } from "@/lib/auth/next";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const type = url.searchParams.get("type");
  const next = url.searchParams.get("next");
  const errorDescription = url.searchParams.get("error_description");
  const error = url.searchParams.get("error");

  const origin = url.origin;

  if (error) {
    const message = errorDescription ?? error;
    return NextResponse.redirect(
      `${origin}/sign-in?error=${encodeURIComponent(message)}`
    );
  }

  if (!code) {
    return NextResponse.redirect(`${origin}/sign-in`);
  }

  const supabase = await createClient();
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

  if (exchangeError) {
    return NextResponse.redirect(
      `${origin}/sign-in?error=${encodeURIComponent("Sign-in link is invalid or has expired.")}`
    );
  }

  if (type === "recovery") {
    return NextResponse.redirect(`${origin}/reset-password`);
  }

  const safeNext = getSafeNext(next);
  return NextResponse.redirect(
    `${origin}/post-login?next=${encodeURIComponent(safeNext)}`
  );
}
