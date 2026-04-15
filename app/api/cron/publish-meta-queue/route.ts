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

  const now = new Date().toISOString();

  // Cap the batch so a single invocation can't be monopolised by a backlog.
  // If there are more than LIMIT due items the next tick will pick them up.
  const LIMIT = 25;
  const { data: due, error: dueErr } = await admin
    .from("proofer_publish_queue")
    .select("id, post_id, platform, scheduled_for")
    .eq("status", "scheduled")
    .lte("scheduled_for", now)
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
