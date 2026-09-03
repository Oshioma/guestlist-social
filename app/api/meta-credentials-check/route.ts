import { NextResponse } from "next/server";
import { diagnoseMetaCredentials, isDryRun } from "@/lib/meta-execute";
import { requireAdsAccess } from "@/lib/auth/permissions";

export const dynamic = "force-dynamic";
// Reaches Meta twice (debug_token, then a signed /me).
export const maxDuration = 30;

/**
 * Answers "are the Meta write credentials usable, and is this deployment even
 * running my latest change?" without needing a campaign or a spend decision.
 *
 * Gated on ads access. It reports app ids, a value length and a non-reversible
 * fingerprint — never a secret. The fingerprint exists because the hard part
 * of a misconfigured env var is not reading the error, it is knowing whether
 * the value you edited actually reached the running deployment: same
 * fingerprint, same value, no matter what the dashboard shows.
 */
export async function GET() {
  await requireAdsAccess();
  const diagnosis = await diagnoseMetaCredentials();
  const secret = process.env.META_APP_SECRET?.trim();

  return NextResponse.json(
    {
      ok: diagnosis.ok,
      detail: diagnosis.detail,

      // Is this deployment the one carrying your change?
      build: (process.env.VERCEL_GIT_COMMIT_SHA ?? "local").slice(0, 7),
      deployedAt: process.env.VERCEL_DEPLOYMENT_ID ?? null,

      // Which app is which.
      tokenBelongsToApp: diagnosis.tokenAppId ?? null,
      metaAppIdEnv: process.env.META_APP_ID ?? null,
      adAccountId: process.env.META_AD_ACCOUNT_ID ?? null,

      // Did the value change? Compare across deploys.
      appSecretFingerprint: diagnosis.appSecretFingerprint ?? null,
      appSecretLength: secret?.length ?? 0,

      hasToken: Boolean(process.env.META_ACCESS_TOKEN),
      hasAppSecret: Boolean(secret),
      dryRun: isDryRun(),
      writesUnsignedFallback: !diagnosis.ok && Boolean(secret),
    },
    { headers: { "cache-control": "no-store" } }
  );
}
