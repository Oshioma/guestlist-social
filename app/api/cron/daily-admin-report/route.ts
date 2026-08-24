import { NextResponse } from "next/server";
import { sendDailyAdminReport } from "@/lib/admin/daily-report";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ---------------------------------------------------------------------------
// /api/cron/daily-admin-report
//
// Sends the daily admin email digest (this week's tasks, queued posts,
// upcoming crew salaries, unresolved client comments) to the recipients
// configured in Settings → Daily admin report. Scheduled via Vercel Cron
// (see vercel.json). With no recipients configured it's a no-op, so running
// it in an unconfigured environment is harmless.
//
// Auth: same posture as the other cron routes — CRON_SECRET bearer token,
// with Vercel Cron's x-vercel-cron header accepted as an alternate
// proof-of-source.
// ---------------------------------------------------------------------------

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
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    const result = await sendDailyAdminReport();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[daily-admin-report] failed:", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
