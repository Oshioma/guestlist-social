import { NextResponse } from "next/server";
import { diagnoseMetaCredentials, isDryRun } from "@/lib/meta-execute";
import { requireAdsAccess } from "@/lib/auth/permissions";

export const dynamic = "force-dynamic";
// Reaches Meta twice (debug_token, then a signed /me).
export const maxDuration = 30;

/**
 * Answers "are the Meta write credentials actually usable?" without needing a
 * campaign, a spend decision, or the server logs. Gated on ads access — it
 * reports app ids and lengths, never secrets.
 */
export async function GET() {
  await requireAdsAccess();
  const diagnosis = await diagnoseMetaCredentials();
  return NextResponse.json(
    {
      ok: diagnosis.ok,
      detail: diagnosis.detail,
      dryRun: isDryRun(),
      hasToken: Boolean(process.env.META_ACCESS_TOKEN),
      hasAppSecret: Boolean(process.env.META_APP_SECRET),
      adAccountId: process.env.META_AD_ACCOUNT_ID ?? null,
    },
    { headers: { "cache-control": "no-store" } }
  );
}
