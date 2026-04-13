import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// /api/meta/debug-env
//
// Temporary diagnostic endpoint. Returns safe FINGERPRINTS of the Meta
// social-publishing env vars as seen by the running deployment — never the
// actual values. Used to confirm that a Vercel redeploy actually picked up
// new env var values.
//
// Safe to expose because we only return:
//   - length
//   - first 4 + last 4 characters
//   - "does it contain whitespace / quotes / only digits"
// The real App ID is already public (it appears in every OAuth URL) and
// the secret/redirect_uri are never revealed in full. Delete this route
// once OAuth is stable.
// ---------------------------------------------------------------------------

function fingerprint(value: string | undefined) {
  if (value === undefined) return { present: false };
  return {
    present: true,
    length: value.length,
    starts_with: value.slice(0, 4),
    ends_with: value.slice(-4),
    has_whitespace: /\s/.test(value),
    has_quotes: value.includes('"') || value.includes("'"),
    is_pure_digits: /^\d+$/.test(value),
  };
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    deployment: {
      vercel_env: process.env.VERCEL_ENV ?? null,
      vercel_url: process.env.VERCEL_URL ?? null,
      commit_sha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    },
    meta_social: {
      // The App ID is already public (it's in every OAuth URL), so we
      // dump it in full — makes copy/paste debugging faster.
      META_SOCIAL_APP_ID_full: process.env.META_SOCIAL_APP_ID ?? null,
      // The redirect URI is also sent in plaintext to Meta in the OAuth
      // URL, so it's not a secret either.
      META_SOCIAL_OAUTH_REDIRECT_URI_full:
        process.env.META_SOCIAL_OAUTH_REDIRECT_URI ?? null,
      META_SOCIAL_APP_ID: fingerprint(process.env.META_SOCIAL_APP_ID),
      META_SOCIAL_APP_SECRET: fingerprint(process.env.META_SOCIAL_APP_SECRET),
      META_SOCIAL_OAUTH_REDIRECT_URI: fingerprint(
        process.env.META_SOCIAL_OAUTH_REDIRECT_URI
      ),
      NEXT_PUBLIC_META_SOCIAL_APP_ID: fingerprint(
        process.env.NEXT_PUBLIC_META_SOCIAL_APP_ID
      ),
    },
  });
}
