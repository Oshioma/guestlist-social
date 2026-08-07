import { NextResponse } from "next/server";
import { metaServiceClient } from "../../../admin-panel/lib/meta-auth";
import { publishMetaQueueItem } from "../../../admin-panel/lib/meta-publish";

export const dynamic = "force-dynamic";
// Each Meta publish is an HTTP round-trip (2 for IG) plus a permalink
// lookup. A batch of 20–30 items shouldn't take anywhere near this, but
// give ourselves headroom before Vercel kills the invocation.
export const maxDuration = 300;

// ---------------------------------------------------------------------------
// /api/cron/publish-meta-queue
//
// Auto-publishes every proofer_publish_queue row whose status = 'scheduled'
// and scheduled_for <= now(). Runs on a Vercel Cron schedule (see
// vercel.json) — a 5-minute cadence gives us ~2.5 minute average lag
// between a scheduled_for time and the post actually going live, which is
// good enough for a social publishing queue.
//
// Two safety rails protect against sending the wrong thing to clients:
//   1. Lateness window (PUBLISH_GRACE_HOURS, default 48h) — a post is only
//      auto-sent within this window after its slot, so a genuinely stale
//      post never goes live long after its date. Cron downtime shorter than
//      the window is absorbed transparently; anything older is marked
//      'failed' (visible in the queue) rather than sent late.
//   2. Mass-send circuit breaker (MAX_AUTO_PUBLISH_BATCH, default 10) — if a
//      single tick finds more due posts than this, it publishes NOTHING and
//      leaves them 'scheduled' for a human to review. A batch that large
//      signals something abnormal (cron recovering from a long outage, clock
//      skew, a bulk reschedule) and auto-firing it could blast many posts at
//      once. See the guard below.
//
// Source of truth is always proofer_publish_queue. This route does NOT
// introduce a parallel publishing path — it just loads the due rows and
// delegates each one to publishMetaQueueItem(), which is the same server
// action the "Publish now" button calls in the UI. So scheduled publishes
// and manual publishes go through identical code, including the same
// approved-status gate and the same failure-handling (status='failed',
// error stored in notes).
//
// Auth: gated on CRON_SECRET (Bearer header). Vercel Cron also injects
// `x-vercel-cron: 1`, which we accept as an alternate proof-of-source when
// CRON_SECRET isn't configured — matches the pattern in
// /api/cron/monthly-reviews.
// ---------------------------------------------------------------------------

function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  const isVercelCron = req.headers.get("x-vercel-cron") === "1";
  if (!secret) return isVercelCron;

  const auth = req.headers.get("authorization") ?? "";
  const presented = auth.startsWith("Bearer ") ? auth.slice(7) : auth;
  return presented === secret || isVercelCron;
}

type RunItem = {
  queue_id: string;
  post_id: string | null;
  platform: string | null;
  scheduled_for: string | null;
  status: "published" | "failed";
  publish_url?: string | null;
  error?: string;
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

  let admin;
  try {
    admin = metaServiceClient();
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }

  const nowDate = new Date();
  const now = nowDate.toISOString();

  // Lateness window. Scheduling is derived from the post's proofer date +
  // time, so a back-dated or long-overdue post would otherwise be "due" and
  // go out on the next tick. We only auto-publish inside a grace window: due
  // within the last PUBLISH_GRACE_HOURS. Anything older missed its slot and is
  // marked 'failed' (visible in the queue) instead of sent late — to re-send,
  // give it a new time on the Proofer. Tunable via env; defaults to 48h,
  // generous enough to ride out a cron/deploy outage of up to two days without
  // killing legitimately-scheduled posts, while still refusing to send content
  // that's more than two days stale. Manual publishing (publishMetaQueueItem)
  // is deliberately not gated by this — the window only governs the automated
  // cron.
  const graceHours = Number(process.env.PUBLISH_GRACE_HOURS) || 48;
  const graceCutoff = new Date(
    nowDate.getTime() - graceHours * 60 * 60 * 1000
  ).toISOString();

  // Retire anything that missed its window so it can't sit as a landmine that
  // fires the moment the window logic ever changes.
  const { data: missed, error: missedErr } = await admin
    .from("proofer_publish_queue")
    .select("id")
    .eq("status", "scheduled")
    .lt("scheduled_for", graceCutoff);
  if (missedErr) {
    return NextResponse.json(
      { ok: false, error: `missed lookup: ${missedErr.message}` },
      { status: 500 }
    );
  }
  if (missed && missed.length > 0) {
    await admin
      .from("proofer_publish_queue")
      .update({
        status: "failed",
        notes:
          "Missed its scheduled time — not sent automatically. Set a new time on the Proofer to re-send.",
        updated_at: now,
      })
      .in(
        "id",
        missed.map((r) => (r as { id: string }).id)
      );
  }

  // Mass-send circuit breaker. Under normal operation only a handful of posts
  // come due in any 5-minute tick. A large due batch means something abnormal
  // — the cron recovering after a long outage, a clock skew, or a bulk
  // reschedule — and auto-firing all of it could blast many posts to clients
  // in error. When the due count exceeds MAX_AUTO_PUBLISH_BATCH we publish
  // NOTHING: the rows stay 'scheduled' (not failed, so nothing is lost) for a
  // human to review and release via "Publish now", or re-time on the Proofer.
  // Idempotent — every tick re-detects and re-halts until the backlog clears.
  // Tunable via env; defaults to 10.
  const maxBatch = Number(process.env.MAX_AUTO_PUBLISH_BATCH) || 10;
  const { count: dueCount, error: countErr } = await admin
    .from("proofer_publish_queue")
    .select("id", { count: "exact", head: true })
    .eq("status", "scheduled")
    .lte("scheduled_for", now)
    .gte("scheduled_for", graceCutoff);
  if (countErr) {
    return NextResponse.json(
      { ok: false, error: `due count: ${countErr.message}` },
      { status: 500 }
    );
  }
  if ((dueCount ?? 0) > maxBatch) {
    console.warn(
      `[cron/publish-meta-queue] HALTED: ${dueCount} posts due at once ` +
        `(threshold ${maxBatch}). Published nothing; awaiting manual review.`
    );
    return NextResponse.json({
      ok: true,
      halted: true,
      now,
      dueCount,
      threshold: maxBatch,
      message:
        `Auto-publish halted: ${dueCount} posts are due at once, above the ` +
        `safety threshold of ${maxBatch}. No posts were sent. Review them in ` +
        `the queue and use "Publish now" to release each, or re-time them on ` +
        `the Proofer.`,
    });
  }

  // Cap the batch so a single invocation can't be monopolised by a backlog.
  // If there are more than LIMIT due items the next tick will pick them up.
  const LIMIT = 25;
  const { data: due, error: dueErr } = await admin
    .from("proofer_publish_queue")
    .select("id, post_id, platform, scheduled_for")
    .eq("status", "scheduled")
    .lte("scheduled_for", now)
    .gte("scheduled_for", graceCutoff)
    .order("scheduled_for", { ascending: true })
    .limit(LIMIT);

  if (dueErr) {
    return NextResponse.json(
      { ok: false, error: `due lookup: ${dueErr.message}` },
      { status: 500 }
    );
  }

  const results: RunItem[] = [];

  for (const row of due ?? []) {
    const queueId = String((row as { id: string | number }).id);
    const postId =
      (row as { post_id: string | number | null }).post_id != null
        ? String((row as { post_id: string | number }).post_id)
        : null;
    const platform =
      ((row as { platform: string | null }).platform as string | null) ?? null;
    const scheduledFor =
      ((row as { scheduled_for: string | null }).scheduled_for as
        | string
        | null) ?? null;

    try {
      const result = await publishMetaQueueItem(queueId);
      if (result.ok) {
        results.push({
          queue_id: queueId,
          post_id: postId,
          platform,
          scheduled_for: scheduledFor,
          status: "published",
          publish_url: result.publishUrl,
        });
      } else {
        // publishMetaQueueItem has already flipped the row to 'failed' and
        // stored the error in notes — we just record it in the response.
        results.push({
          queue_id: queueId,
          post_id: postId,
          platform,
          scheduled_for: scheduledFor,
          status: "failed",
          error: result.error,
        });
      }
    } catch (err) {
      // Defensive — publishMetaQueueItem is supposed to catch its own
      // errors and return { ok: false }, but if anything slips through we
      // mark the row failed so it won't be retried forever on the next tick.
      const message = err instanceof Error ? err.message : String(err);
      await admin
        .from("proofer_publish_queue")
        .update({
          status: "failed",
          notes: `cron: ${message}`.slice(0, 2000),
          updated_at: new Date().toISOString(),
        })
        .eq("id", queueId);
      results.push({
        queue_id: queueId,
        post_id: postId,
        platform,
        scheduled_for: scheduledFor,
        status: "failed",
        error: message,
      });
    }
  }

  const summary = {
    published: results.filter((r) => r.status === "published").length,
    failed: results.filter((r) => r.status === "failed").length,
    total: results.length,
  };

  console.log(
    `[cron/publish-meta-queue] published=${summary.published} ` +
      `failed=${summary.failed} total=${summary.total}`
  );

  return NextResponse.json({ ok: true, now, summary, results });
}
