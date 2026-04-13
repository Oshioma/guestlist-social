import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// /api/meta/debug-env
//
// Temporary diagnostic endpoint. Returns safe metadata about the Meta
// social-publishing env vars as seen by the running deployment — NOT the
// full values. Use this to confirm Vercel actually redeployed with the
// correct env vars after an edit.
//
// Gated on CRON_SECRET (Bearer header) so random visitors can't fingerprint
// our env. Delete this route once OAuth is working end-to-end.
// ---------------------------------------------------------------------------

function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization") ?? "";
  const presented = auth.startsWith("Bearer ") ? auth.slice(7) : auth;
  return presented === secret;
}

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

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized — pass Bearer CRON_SECRET" },
      { status: 401 }
    );
  }

  return NextResponse.json({
    ok: true,
    deployment: {
      vercel_env: process.env.VERCEL_ENV ?? null,
      vercel_url: process.env.VERCEL_URL ?? null,
      commit_sha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    },
    meta_social: {
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
