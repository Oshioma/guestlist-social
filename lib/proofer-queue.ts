import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { defaultPublishTimeUtc } from "./timezone";

// ---------------------------------------------------------------------------
// Publish-queue helpers shared by every path that can sign a post off.
//
// Signing a post off (status "proofed" or "approved") is what puts it in the
// publish queue — there is no separate "schedule" step. The operator board
// (updateProoferStatusAction) and the client portal (setPortalPostApprovalAction)
// both go through queueSignedOffPost, so a post approved by the client goes out
// exactly like one approved on the board. (The portal used to only flip the
// status, so client-approved posts silently never published.)
// ---------------------------------------------------------------------------

export const VALID_PUBLISH_TARGETS = ["instagram", "facebook"] as const;
export type PublishTargetValue = (typeof VALID_PUBLISH_TARGETS)[number];

/**
 * Destinations a post publishes to. Order and duplicates are normalised so the
 * stored array is stable. An explicitly empty selection is preserved — that's
 * "don't publish this anywhere yet", not a missing value.
 */
export function normalizePublishTargets(value: unknown): PublishTargetValue[] {
  if (!Array.isArray(value)) return [];
  const set = new Set(
    value.filter((v): v is PublishTargetValue =>
      (VALID_PUBLISH_TARGETS as readonly unknown[]).includes(v)
    )
  );
  return VALID_PUBLISH_TARGETS.filter((t) => set.has(t));
}

// The moment a post goes out is derived entirely from the proofer: its date
// plus its publish time (stored as a UTC "HH:MM"). This is the single source
// of truth for scheduling — the publish queue never sets a time of its own, so
// changing the time on the proofer is the only way to reschedule.
export function scheduledForFromPost(
  postDate: string,
  publishTime: string | null | undefined
): string {
  const date = String(postDate).slice(0, 10);
  const time =
    publishTime && /^\d{2}:\d{2}$/.test(publishTime)
      ? publishTime
      : defaultPublishTimeUtc(date);
  return `${date}T${time}:00.000Z`;
}

/**
 * Queue a signed-off post: one row per publish target. Only targets not
 * already in the queue are inserted, so re-approving a post whose Instagram
 * slot is already scheduled or published never resets it.
 *
 * `db` is whichever client the caller is allowed to write with — the session
 * client on the board, the service role in the portal (after it has verified
 * the post belongs to the viewer's client). Errors are returned, not thrown:
 * the status change has already succeeded and callers decide how loud to be.
 */
export async function queueSignedOffPost(
  db: SupabaseClient,
  post: {
    id: string | number;
    platform: string | null;
    publish_targets: unknown;
    post_date: string;
    publish_time: string | null;
  },
  createdBy: string | null
): Promise<{ error: string | null }> {
  let targets = normalizePublishTargets(post.publish_targets);
  // Posts predating publish_targets fall back to what their platform
  // implied, so an un-migrated post still queues correctly.
  if (targets.length === 0) {
    targets = post.platform === "facebook" ? ["facebook"] : ["instagram"];
  }

  const { data: existingRows } = await db
    .from("proofer_publish_queue")
    .select("platform")
    .eq("post_id", post.id);
  const alreadyQueued = new Set((existingRows ?? []).map((row) => row.platform));

  const scheduledFor = scheduledForFromPost(String(post.post_date), post.publish_time);
  const now = new Date().toISOString();
  const rowsToInsert = targets
    .filter((target) => !alreadyQueued.has(target))
    .map((platform) => ({
      post_id: post.id,
      platform,
      status: "scheduled",
      scheduled_for: scheduledFor,
      created_by: createdBy,
      updated_at: now,
    }));

  if (rowsToInsert.length === 0) return { error: null };
  const { error } = await db.from("proofer_publish_queue").insert(rowsToInsert);
  return { error: error ? error.message : null };
}
