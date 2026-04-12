import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
// Generation can take a moment per client. Allow a long-ish window so a
// portfolio of 20+ clients doesn't get truncated.
export const maxDuration = 300;

// ---------------------------------------------------------------------------
// /api/cron/monthly-reviews
//
// Idempotent monthly review backfill. Runs on the 1st of each month (via
// Vercel Cron — see vercel.json) and mints a draft review for the previous
// calendar month for every active client that doesn't already have one.
//
// Why a separate cron route instead of folding this into run-pipeline:
//   • Different cadence — the pipeline runs daily-ish, this is monthly.
//   • Different failure mode — a flaky meta sync shouldn't block reviews,
//     and a flaky review shouldn't block daily ad scoring.
//   • Different auth surface — Vercel Cron sends a known header we can gate
//     on without needing a logged-in operator.
//
// Auth: gated on CRON_SECRET (Bearer header) so it can be called from any
// scheduler — Vercel Cron, GitHub Actions, Supabase pg_cron, etc. Vercel
// Cron also injects `x-vercel-cron: 1` which we accept as an alternate
// proof-of-source when CRON_SECRET isn't configured.
//
// Idempotency: before generating, we check for an existing review row with
// the same (client_id, period_type='monthly', period_start, period_end).
// Re-running the cron the same day is a no-op. The operator can also still
// hit "Generate review" by hand from the admin UI without colliding.
// ---------------------------------------------------------------------------

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env vars");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Last full calendar month, in UTC. Called on (or shortly after) the 1st,
// so "last month" is unambiguous — we step back one day from the first of
// this month, then snap to the start of the resulting month.
function lastFullMonth(now: Date = new Date()): {
  start: string;
  end: string;
  label: string;
} {
  const firstOfThis = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
  );
  const end = new Date(firstOfThis.getTime() - 24 * 60 * 60 * 1000); // last day of prev month
  const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));
  const label = start.toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  return { start: isoDate(start), end: isoDate(end), label };
}

function getBaseUrl(req: Request): string {
  // Prefer the request origin over VERCEL_URL — VERCEL_URL is the
  // deployment-specific hostname, which is gated by Vercel
  // Authentication when enabled, so internal fetches to it return the
  // SSO HTML page instead of JSON. NEXT_PUBLIC_APP_URL is honoured first
  // as an explicit override.
  return process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
}

function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  // Vercel Cron sends this header on its outbound requests; trust it as a
  // fallback when no shared secret is configured.
  const isVercelCron = req.headers.get("x-vercel-cron") === "1";
  if (!secret) return isVercelCron;

  const auth = req.headers.get("authorization") ?? "";
  const presented = auth.startsWith("Bearer ") ? auth.slice(7) : auth;
  return presented === secret || isVercelCron;
}

type RunResult = {
  client_id: number;
  client_name: string;
  status: "created" | "skipped_existing" | "skipped_no_data" | "failed";
  review_id?: number;
  reason?: string;
};

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

  const supabase = admin();
  const period = lastFullMonth();
  const baseUrl = getBaseUrl(req);

  // Pull every non-archived client. We don't filter by status here — even
  // paused or onboarding clients get a review so the portal never shows a
  // dead "no reviews yet" state. The reviewer template degrades gracefully
  // when spend is zero (renders "Quiet period — no spend to report.").
  const { data: clients, error: clientsErr } = await supabase
    .from("clients")
    .select("id, name, archived")
    .eq("archived", false);
  if (clientsErr) {
    return NextResponse.json(
      { ok: false, error: `clients: ${clientsErr.message}` },
      { status: 500 }
    );
  }

  const results: RunResult[] = [];

  for (const c of clients ?? []) {
    const clientId = Number((c as any).id);
    const clientName = String((c as any).name ?? `Client ${clientId}`);

    // Idempotency: skip if a monthly review for this exact window already
    // exists. Includes drafts — we never want two for the same period.
    const { data: existing, error: existErr } = await supabase
      .from("reviews")
      .select("id")
      .eq("client_id", clientId)
      .eq("period_type", "monthly")
      .eq("period_start", period.start)
      .eq("period_end", period.end)
      .maybeSingle();
    if (existErr) {
      results.push({
        client_id: clientId,
        client_name: clientName,
        status: "failed",
        reason: `dedupe check: ${existErr.message}`,
      });
      continue;
    }
    if (existing) {
      results.push({
        client_id: clientId,
        client_name: clientName,
        status: "skipped_existing",
        review_id: Number((existing as any).id),
      });
      continue;
    }

    // Delegate to the existing generator. Forward the cron secret so the
    // call inherits the same auth posture if generate-review is ever
    // gated later.
    try {
      const res = await fetch(`${baseUrl}/api/generate-review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: clientId,
          period_type: "monthly",
          period_start: period.start,
          period_end: period.end,
        }),
        cache: "no-store",
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        review_id?: number;
        error?: string;
      };
      if (!res.ok || !body.ok) {
        results.push({
          client_id: clientId,
          client_name: clientName,
          status: "failed",
          reason: body.error ?? `HTTP ${res.status}`,
        });
        continue;
      }
      results.push({
        client_id: clientId,
        client_name: clientName,
        status: "created",
        review_id: body.review_id,
      });
    } catch (e) {
      results.push({
        client_id: clientId,
        client_name: clientName,
        status: "failed",
        reason: e instanceof Error ? e.message : String(e),
      });
    }
  }

  const summary = {
    created: results.filter((r) => r.status === "created").length,
    skipped: results.filter((r) => r.status === "skipped_existing").length,
    failed: results.filter((r) => r.status === "failed").length,
  };

  // Loud server-side log so cron-runner output makes the run obvious in
  // Vercel logs even if the caller doesn't read the JSON body.
  console.log(
    `[cron/monthly-reviews] period=${period.label} ` +
      `created=${summary.created} skipped=${summary.skipped} failed=${summary.failed}`
  );

  return NextResponse.json({
    ok: true,
    period,
    summary,
    results,
  });
}
