import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
// Pattern feedback is small (one row per pattern slice). The whole sweep
// fits comfortably inside the default invocation window — no maxDuration
// override needed.

// ---------------------------------------------------------------------------
// /api/cron/retire-stale-patterns
//
// The reaper. Walks pattern_feedback once a week, finds rows whose engine
// track record has gone decisively negative, and stamps retired_at on them
// so the decision engine stops consulting them.
//
// Why this exists. /api/generate-decisions already has an in-memory "block"
// rule: if a pattern has ≥3 decisive verdicts and ≥60% are negative, it
// gets vetoed for that one request. That's good for the immediate decision
// but it doesn't change the underlying record — every subsequent run
// re-derives the same block, and the dashboard keeps surfacing the bad
// pattern as if it were still in play. After enough sustained losses the
// honest answer is "kill it permanently" rather than "keep blocking it
// every time we ask".
//
// Threshold semantics. We deliberately set the bar higher than the in-memory
// block (5 decisive vs 3) so retirement is a heavier decision than a single
// veto. A pattern that briefly dipped negative on a small sample can recover;
// one that's racked up 5+ decisive outcomes with a 60%+ negative ratio has
// disqualified itself.
//
// Auth + idempotency mirror /api/cron/monthly-reviews — Bearer CRON_SECRET
// or the x-vercel-cron header. Re-runs are no-ops because we only stamp
// retired_at where it's currently NULL.
// ---------------------------------------------------------------------------

// Minimum decisive (positive + negative) verdicts before a pattern can be
// retired. Three is the in-memory veto threshold; five is "we've now seen
// it fail enough times that this isn't a passing bad streak".
const MIN_DECISIVE_VERDICTS = 5;
// Negative ratio at which we flip the row. Matches the in-memory veto's
// 0.6 — same shape, different stakes.
const RETIRE_NEG_RATIO = 0.6;

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env vars");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  const isVercelCron = req.headers.get("x-vercel-cron") === "1";
  if (!secret) return isVercelCron;
  const auth = req.headers.get("authorization") ?? "";
  const presented = auth.startsWith("Bearer ") ? auth.slice(7) : auth;
  return presented === secret || isVercelCron;
}

type RetiredRow = {
  pattern_key: string;
  industry: string;
  positive: number;
  negative: number;
  decisive: number;
  neg_ratio: number;
  reason: string;
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

  let supabase;
  try {
    supabase = admin();
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }

  // Only the active slice — already-retired rows stay retired (we never
  // un-retire automatically; that's an explicit operator action).
  const { data: feedbackRows, error: scanErr } = await supabase
    .from("pattern_feedback")
    .select(
      "pattern_key, industry, positive_verdicts, negative_verdicts"
    )
    .is("retired_at", null);

  if (scanErr) {
    return NextResponse.json(
      { ok: false, error: `pattern_feedback scan: ${scanErr.message}` },
      { status: 500 }
    );
  }

  const candidates: RetiredRow[] = [];
  for (const row of (feedbackRows ?? []) as {
    pattern_key: string;
    industry: string | null;
    positive_verdicts: number | null;
    negative_verdicts: number | null;
  }[]) {
    const positive = Number(row.positive_verdicts ?? 0);
    const negative = Number(row.negative_verdicts ?? 0);
    const decisive = positive + negative;
    if (decisive < MIN_DECISIVE_VERDICTS) continue;
    const negRatio = negative / decisive;
    if (negRatio < RETIRE_NEG_RATIO) continue;

    const pct = Math.round(negRatio * 100);
    candidates.push({
      pattern_key: row.pattern_key,
      industry: row.industry ?? "",
      positive,
      negative,
      decisive,
      neg_ratio: Number(negRatio.toFixed(3)),
      reason: `${negative} of ${decisive} verdicts negative (${pct}%)`,
    });
  }

  // Stamp them. Composite primary key is (pattern_key, industry), so the
  // update is unambiguous. We update one row at a time rather than batching
  // because the candidate set is tiny (typically <10 across an entire
  // agency) and individual updates give us clean per-row failure surfacing.
  const retiredAt = new Date().toISOString();
  const failed: { pattern_key: string; industry: string; error: string }[] = [];

  for (const c of candidates) {
    const { error: upErr } = await supabase
      .from("pattern_feedback")
      .update({
        retired_at: retiredAt,
        retired_reason: c.reason,
        updated_at: retiredAt,
      })
      .eq("pattern_key", c.pattern_key)
      .eq("industry", c.industry);
    if (upErr) {
      failed.push({
        pattern_key: c.pattern_key,
        industry: c.industry,
        error: upErr.message,
      });
    }
  }

  const retiredCount = candidates.length - failed.length;

  console.log(
    `[cron/retire-stale-patterns] scanned=${feedbackRows?.length ?? 0} ` +
      `retired=${retiredCount} failed=${failed.length}`
  );

  return NextResponse.json({
    ok: true,
    threshold: {
      min_decisive_verdicts: MIN_DECISIVE_VERDICTS,
      negative_ratio: RETIRE_NEG_RATIO,
    },
    scanned: feedbackRows?.length ?? 0,
    retired: retiredCount,
    failed: failed.length,
    retired_at: retiredAt,
    details: candidates,
    failures: failed,
  });
}
