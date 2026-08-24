import { NextResponse } from "next/server";
import {
  maybeSendDailyReport,
  sendDailyAdminReport,
} from "@/lib/admin/daily-report";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ---------------------------------------------------------------------------
// /api/cron/daily-admin-report
//
// Manual/external trigger for the daily admin email digest (this week's
// tasks, queued posts, monthly revenue/costs, upcoming crew salaries,
// unresolved client comments), sent to the recipients configured in
// Settings → Daily admin report.
//
// Two triggers share this send, and the once-a-day marker in app_settings
// keeps them from double-sending: the Supabase pg_cron schedule (see
// 20260824_supabase_cron_schedules.sql) calls this route each morning, and
// maybeSendDailyReport() also fires after admin-panel page loads as a
// backup. By default this route respects the marker (already sent today →
// no-op); pass ?force=1 to send regardless. With no recipients configured
// it's always a no-op.
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
    const force = new URL(req.url).searchParams.get("force") === "1";
    if (force) {
      const result = await sendDailyAdminReport();
      return NextResponse.json({ ok: true, forced: true, ...result });
    }
    const outcome = await maybeSendDailyReport();
    return NextResponse.json({ ok: true, ...outcome });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[daily-admin-report] failed:", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
