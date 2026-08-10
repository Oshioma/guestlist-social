import { NextResponse } from "next/server";
import {
  metaServiceClient,
  refreshLongLivedInstagramToken,
} from "../../../admin-panel/lib/meta-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// ---------------------------------------------------------------------------
// /api/cron/refresh-instagram-tokens
//
// Instagram-Login long-lived tokens expire after 60 days and, unlike the
// Facebook-Page tokens, there's no parent user token keeping them alive — if
// one lapses the client silently drops offline until they reconnect. This job
// refreshes every auth_type='instagram_login' account whose token expires
// within REFRESH_WINDOW_DAYS, extending it another ~60 days.
//
// Meta allows refresh only when the token is >24h old and not yet expired, so
// running daily with a 7-day window gives many chances to catch each one well
// before it lapses. Runs on a Vercel Cron schedule (see vercel.json).
//
// Auth mirrors the other cron routes: CRON_SECRET bearer, or Vercel's
// x-vercel-cron header.
// ---------------------------------------------------------------------------

const REFRESH_WINDOW_DAYS = 7;

function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  const isVercelCron = req.headers.get("x-vercel-cron") === "1";
  if (!secret) return isVercelCron;
  const auth = req.headers.get("authorization") ?? "";
  const presented = auth.startsWith("Bearer ") ? auth.slice(7) : auth;
  return presented === secret || isVercelCron;
}

export async function GET(req: Request) {
  return handle(req);
}
export async function POST(req: Request) {
  return handle(req);
}

async function handle(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let admin;
  try {
    admin = metaServiceClient();
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }

  const cutoff = new Date(
    Date.now() + REFRESH_WINDOW_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();

  const { data: due, error: dueErr } = await admin
    .from("connected_meta_accounts")
    .select("id, account_id, account_name, access_token, token_expires_at")
    .eq("platform", "instagram")
    .eq("auth_type", "instagram_login")
    .lte("token_expires_at", cutoff);

  if (dueErr) {
    return NextResponse.json(
      { ok: false, error: `due lookup: ${dueErr.message}` },
      { status: 500 }
    );
  }

  let refreshed = 0;
  let failed = 0;
  const errors: Array<{ account: string; error: string }> = [];

  for (const row of due ?? []) {
    const id = (row as { id: string }).id;
    const label =
      (row as { account_name: string | null }).account_name ||
      (row as { account_id: string }).account_id;
    try {
      const next = await refreshLongLivedInstagramToken(
        (row as { access_token: string }).access_token
      );
      const now = new Date().toISOString();
      const expiresAt = next.expiresIn
        ? new Date(Date.now() + next.expiresIn * 1000).toISOString()
        : null;
      const { error: updErr } = await admin
        .from("connected_meta_accounts")
        .update({
          access_token: next.accessToken,
          token_expires_at: expiresAt,
          updated_at: now,
        })
        .eq("id", id);
      if (updErr) throw new Error(updErr.message);
      refreshed += 1;
    } catch (err) {
      failed += 1;
      errors.push({
        account: String(label),
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const summary = { refreshed, failed, total: (due ?? []).length };
  console.log(
    `[cron/refresh-instagram-tokens] refreshed=${refreshed} failed=${failed} total=${summary.total}`
  );
  return NextResponse.json({ ok: true, summary, errors });
}
