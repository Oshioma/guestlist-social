// /auth/callback — handles both PKCE and OTP returns from Supabase.
//
// Two flavours of email/OAuth link land here:
//   - `?code=...`                      PKCE (OAuth providers) → exchangeCodeForSession
//   - `?token_hash=...&type=invite|recovery|signup|email_change` → verifyOtp
//
// Success redirects:
//   - type=recovery → /reset-password
//   - type=invite   → /accept-invite (user sets a password + name)
//   - anything else → /post-login?next=<safeNext> for role dispatch

import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getSafeNext } from "@/lib/auth/next";

const OTP_TYPES: EmailOtpType[] = [
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
];

function isOtpType(value: string | null): value is EmailOtpType {
  return !!value && (OTP_TYPES as string[]).includes(value);
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const origin = url.origin;

  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const typeParam = url.searchParams.get("type");
  const next = url.searchParams.get("next");
  const errorDescription = url.searchParams.get("error_description");
  const errorParam = url.searchParams.get("error");

  if (errorParam) {
    const message = errorDescription ?? errorParam;
    return NextResponse.redirect(
      `${origin}/sign-in?error=${encodeURIComponent(message)}`
    );
  }

  const supabase = await createClient();

  if (tokenHash && isOtpType(typeParam)) {
    const { error } = await supabase.auth.verifyOtp({
      type: typeParam,
      token_hash: tokenHash,
    });
    if (error) {
      return NextResponse.redirect(
        `${origin}/sign-in?error=${encodeURIComponent("Link is invalid or has expired.")}`
      );
    }

    if (typeParam === "recovery") {
      return NextResponse.redirect(`${origin}/reset-password`);
    }
    if (typeParam === "invite") {
      return NextResponse.redirect(`${origin}/accept-invite`);
    }

    const safeNext = getSafeNext(next);
    return NextResponse.redirect(
      `${origin}/post-login?next=${encodeURIComponent(safeNext)}`
    );
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(
        `${origin}/sign-in?error=${encodeURIComponent("Sign-in link is invalid or has expired.")}`
      );
    }

    if (typeParam === "recovery") {
      return NextResponse.redirect(`${origin}/reset-password`);
    }
    if (typeParam === "invite") {
      return NextResponse.redirect(`${origin}/accept-invite`);
    }

    const safeNext = getSafeNext(next);
    return NextResponse.redirect(
      `${origin}/post-login?next=${encodeURIComponent(safeNext)}`
    );
  }

  return NextResponse.redirect(`${origin}/sign-in`);
}
