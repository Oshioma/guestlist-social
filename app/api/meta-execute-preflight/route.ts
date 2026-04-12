/**
 * GET /api/meta-execute-preflight
 *
 * Read-only health check for the Meta WRITE path. Run this before flipping
 * META_EXECUTE_DRY_RUN to "false" — it verifies that:
 *
 *   1. META_ACCESS_TOKEN is present
 *   2. META_APP_SECRET is present
 *   3. The signed (appsecret_proof) GET against the ad account succeeds
 *      against Meta's actual servers — i.e. the proof we compute matches
 *      what Meta expects, and the token has the permissions it needs.
 *   4. The current dry-run mode is reported back so the operator can see
 *      whether the next Execute click will write or simulate.
 *
 * The endpoint never POSTs to Meta. The whole point is to confirm that the
 * write path is wired correctly *before* trusting it with a real change.
 *
 * Response shape:
 *   {
 *     ok: boolean,
 *     dry_run: boolean,
 *     checks: {
 *       access_token: { ok, detail? },
 *       app_secret: { ok, detail? },
 *       signed_read: { ok, detail?, account? }
 *     }
 *   }
 *
 * 200 with ok=true means it's safe to flip. 200 with ok=false means
 * something is wrong — read the per-check `detail` to see what.
 */

import { NextResponse } from "next/server";
import { createHmac } from "crypto";

export const dynamic = "force-dynamic";

const API_VERSION = "v25.0";
const BASE_URL = `https://graph.facebook.com/${API_VERSION}`;

type CheckResult = {
  ok: boolean;
  detail?: string;
};

type SignedReadResult = CheckResult & {
  account?: { id: string; name?: string; currency?: string };
};

export async function GET() {
  const token = process.env.META_ACCESS_TOKEN;
  const appSecret = process.env.META_APP_SECRET;
  const accountId = process.env.META_AD_ACCOUNT_ID;
  const dryRun = process.env.META_EXECUTE_DRY_RUN !== "false";

  const accessTokenCheck: CheckResult = token
    ? { ok: true }
    : { ok: false, detail: "META_ACCESS_TOKEN is not set in env." };

  const appSecretCheck: CheckResult = appSecret
    ? { ok: true }
    : {
        ok: false,
        detail:
          "META_APP_SECRET is not set in env. Writes are signed with " +
          "appsecret_proof and will fail without it.",
      };

  // Don't even attempt the network probe if the prerequisites are missing —
  // the failure mode would be confusing ("missing env" disguised as "Meta
  // API error").
  let signedReadCheck: SignedReadResult;
  if (!token || !appSecret) {
    signedReadCheck = {
      ok: false,
      detail: "Skipped — META_ACCESS_TOKEN and META_APP_SECRET must both be set.",
    };
  } else if (!accountId) {
    signedReadCheck = {
      ok: false,
      detail:
        "Skipped — META_AD_ACCOUNT_ID is not set. The preflight signs a GET " +
        "against the ad account to prove the write path works end-to-end.",
    };
  } else {
    signedReadCheck = await runSignedReadProbe(token, appSecret, accountId);
  }

  const overallOk =
    accessTokenCheck.ok && appSecretCheck.ok && signedReadCheck.ok;

  return NextResponse.json({
    ok: overallOk,
    dry_run: dryRun,
    checks: {
      access_token: accessTokenCheck,
      app_secret: appSecretCheck,
      signed_read: signedReadCheck,
    },
    next_step: overallOk
      ? dryRun
        ? "All checks pass. Set META_EXECUTE_DRY_RUN=false in your deploy env to enable live writes."
        : "Live mode is engaged. Approving + executing a queue row will hit Meta."
      : "Fix the failing checks above before flipping live mode.",
  });
}

/**
 * Mirrors the metaGet helper in lib/meta-execute.ts but inline so this
 * route stays self-contained — we don't want a preflight to import the
 * executor module and accidentally pull in execution side-effects.
 */
async function runSignedReadProbe(
  token: string,
  appSecret: string,
  accountId: string
): Promise<SignedReadResult> {
  const proof = createHmac("sha256", appSecret).update(token).digest("hex");
  const accountPath = accountId.startsWith("act_")
    ? accountId
    : `act_${accountId}`;

  const url = new URL(`${BASE_URL}/${accountPath}`);
  url.searchParams.set("access_token", token);
  url.searchParams.set("appsecret_proof", proof);
  url.searchParams.set("fields", "id,name,currency");

  try {
    const res = await fetch(url.toString(), { cache: "no-store" });
    const data = await res.json();
    if (data.error) {
      return {
        ok: false,
        detail: `Meta GET ${accountPath}: ${data.error.message ?? "unknown error"}`,
      };
    }
    return {
      ok: true,
      account: {
        id: String(data.id),
        name: data.name,
        currency: data.currency,
      },
    };
  } catch (err) {
    return {
      ok: false,
      detail: `Network error talking to Meta: ${
        err instanceof Error ? err.message : String(err)
      }`,
    };
  }
}
