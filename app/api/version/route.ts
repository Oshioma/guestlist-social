import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Which build is actually serving traffic.
 *
 * Added because a run of "the fix didn't change anything" reports could not be
 * told apart from "the fix never deployed" — nothing in the app or in GitHub
 * said which commit production was running. Public on purpose: it returns a
 * commit sha and nothing else, so it can be checked from anywhere, by anyone
 * debugging a deploy, without signing in.
 */
export function GET() {
  return NextResponse.json(
    {
      sha: process.env.VERCEL_GIT_COMMIT_SHA ?? "local",
      ref: process.env.VERCEL_GIT_COMMIT_REF ?? "local",
      message: process.env.VERCEL_GIT_COMMIT_MESSAGE?.split("\n")[0] ?? null,
      env: process.env.VERCEL_ENV ?? "development",
      skewProtection: process.env.VERCEL_SKEW_PROTECTION_ENABLED === "1",
      deploymentId: process.env.VERCEL_DEPLOYMENT_ID ?? null,
      now: new Date().toISOString(),
    },
    { headers: { "cache-control": "no-store" } }
  );
}
