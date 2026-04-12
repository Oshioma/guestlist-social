/**
 * POST /api/meta-execute-decision
 *
 * The single entry point for actually pushing a `meta_execution_queue` row
 * to Meta. Nothing else in the codebase is allowed to call the executor
 * functions directly — every write goes through here so we get one place
 * for: load → re-check → guard → execute → log → mark.
 *
 * Request body:
 *   { queueId: number, action: "approve" | "preview" | "execute" | "cancel" }
 *
 *   - approve  → mark pending row as approved (operator clicked Approve)
 *   - preview  → re-fetch Meta state, run guards, return what WOULD happen
 *                without writing. Safe to call repeatedly. Updates
 *                last_checked_at + last_checked_state on the row.
 *   - execute  → run the actual write. Requires status='approved'.
 *   - cancel   → mark pending or approved row as cancelled.
 *
 * Auth: Service-role supabase client. The CALLING admin UI is responsible
 * for verifying the operator has permission before hitting this route —
 * which is fine because the route is server-only and not reachable from
 * the public site.
 */

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  executePauseAd,
  executeIncreaseAdsetBudget,
  executeDuplicateAd,
  fetchAdState,
  fetchAdsetState,
  assertQueueItemFresh,
  isDryRun,
  DUPLICATE_COOLDOWN_MS,
} from "@/lib/meta-execute";

export const dynamic = "force-dynamic";

type DecisionType =
  | "pause_ad"
  | "increase_adset_budget"
  | "duplicate_ad";

type QueueRow = {
  id: number;
  client_id: number | null;
  campaign_id: number | null;
  ad_id: number | null;
  adset_meta_id: string | null;
  ad_meta_id: string | null;
  decision_type: DecisionType | string;
  proposed_payload: Record<string, unknown> | null;
  reason: string | null;
  risk_level: string | null;
  status: string;
  approved_by: string | null;
  approved_at: string | null;
  executed_at: string | null;
  execution_result: unknown;
  execution_error: string | null;
  last_checked_at: string | null;
  last_checked_state: unknown;
  created_at: string;
};

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// ---------------------------------------------------------------------------
// Per-decision-type re-fetch + run dispatcher.
// Splitting this out keeps the action handler readable and gives us one
// place to add a new decision_type.
// ---------------------------------------------------------------------------

async function refreshState(row: QueueRow) {
  if (row.decision_type === "pause_ad" || row.decision_type === "duplicate_ad") {
    if (!row.ad_meta_id) throw new Error("Queue row missing ad_meta_id.");
    return await fetchAdState(row.ad_meta_id);
  }
  if (row.decision_type === "increase_adset_budget") {
    if (!row.adset_meta_id) throw new Error("Queue row missing adset_meta_id.");
    return await fetchAdsetState(row.adset_meta_id);
  }
  throw new Error(`Unknown decision_type ${row.decision_type}.`);
}

async function runExecutor(row: QueueRow) {
  if (row.decision_type === "pause_ad") {
    if (!row.ad_meta_id) throw new Error("Queue row missing ad_meta_id.");
    return await executePauseAd(row.ad_meta_id);
  }

  if (row.decision_type === "increase_adset_budget") {
    if (!row.adset_meta_id) throw new Error("Queue row missing adset_meta_id.");
    const payload = row.proposed_payload ?? {};
    const percentChange = Number(payload.percent_change);
    const expectedCurrentBudgetCents =
      typeof payload.daily_budget_old === "number"
        ? Number(payload.daily_budget_old)
        : undefined;
    if (!Number.isFinite(percentChange) || percentChange <= 0) {
      throw new Error(
        `Queue row proposed_payload.percent_change is invalid: ${String(payload.percent_change)}`
      );
    }
    return await executeIncreaseAdsetBudget({
      adsetMetaId: row.adset_meta_id,
      percentChange,
      expectedCurrentBudgetCents,
    });
  }

  if (row.decision_type === "duplicate_ad") {
    if (!row.ad_meta_id) throw new Error("Queue row missing ad_meta_id.");
    const payload = row.proposed_payload ?? {};
    return await executeDuplicateAd({
      adMetaId: row.ad_meta_id,
      newNameSuffix: typeof payload.new_name_suffix === "string"
        ? payload.new_name_suffix
        : undefined,
    });
  }

  throw new Error(`Unknown decision_type ${row.decision_type}.`);
}

/**
 * Cooldown check for duplicates. We do this here in the route (not in the
 * executor) because it needs database access — the executor library is
 * intentionally pure Meta + crypto.
 */
async function assertNoRecentDuplicate(
  supabase: ReturnType<typeof getSupabase>,
  sourceAdMetaId: string
): Promise<void> {
  const cutoff = new Date(Date.now() - DUPLICATE_COOLDOWN_MS).toISOString();
  const { data, error } = await supabase
    .from("meta_execution_queue")
    .select("id, executed_at")
    .eq("decision_type", "duplicate_ad")
    .eq("ad_meta_id", sourceAdMetaId)
    .eq("status", "executed")
    .gt("executed_at", cutoff)
    .limit(1);

  if (error) {
    throw new Error(`Cooldown check failed: ${error.message}`);
  }
  if (data && data.length > 0) {
    throw new Error(
      `Source ad ${sourceAdMetaId} was already duplicated within the last 24h (queue id ${data[0].id}).`
    );
  }
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(req: Request) {
  let queueId: number | null = null;

  try {
    const body = await req.json();
    queueId = Number(body.queueId);
    const action = String(body.action ?? "");
    const approvedBy = typeof body.approvedBy === "string" ? body.approvedBy : null;

    if (!queueId || !action) {
      return NextResponse.json(
        { ok: false, error: "queueId and action required" },
        { status: 400 }
      );
    }

    const supabase = getSupabase();

    // 1. Load the queue row.
    const { data: row, error: loadErr } = await supabase
      .from("meta_execution_queue")
      .select("*")
      .eq("id", queueId)
      .single<QueueRow>();

    if (loadErr || !row) {
      return NextResponse.json(
        { ok: false, error: `Queue row ${queueId} not found` },
        { status: 404 }
      );
    }

    // -----------------------------------------------------------------------
    // APPROVE — no Meta call. Just transition pending → approved.
    // -----------------------------------------------------------------------
    if (action === "approve") {
      if (row.status !== "pending") {
        return NextResponse.json(
          { ok: false, error: `Cannot approve row in status ${row.status}` },
          { status: 409 }
        );
      }

      const { error: updateErr } = await supabase
        .from("meta_execution_queue")
        .update({
          status: "approved",
          approved_at: new Date().toISOString(),
          approved_by: approvedBy,
        })
        .eq("id", queueId);

      if (updateErr) {
        return NextResponse.json(
          { ok: false, error: updateErr.message },
          { status: 500 }
        );
      }

      return NextResponse.json({ ok: true, status: "approved" });
    }

    // -----------------------------------------------------------------------
    // CANCEL — operator declined. Allowed from pending OR approved.
    // -----------------------------------------------------------------------
    if (action === "cancel") {
      if (row.status !== "pending" && row.status !== "approved") {
        return NextResponse.json(
          { ok: false, error: `Cannot cancel row in status ${row.status}` },
          { status: 409 }
        );
      }
      const { error: updateErr } = await supabase
        .from("meta_execution_queue")
        .update({ status: "cancelled" })
        .eq("id", queueId);

      if (updateErr) {
        return NextResponse.json(
          { ok: false, error: updateErr.message },
          { status: 500 }
        );
      }
      return NextResponse.json({ ok: true, status: "cancelled" });
    }

    // -----------------------------------------------------------------------
    // PREVIEW — re-fetch state and run guards but never write.
    // -----------------------------------------------------------------------
    if (action === "preview") {
      try {
        const liveState = await refreshState(row);

        await supabase
          .from("meta_execution_queue")
          .update({
            last_checked_at: new Date().toISOString(),
            last_checked_state: liveState,
          })
          .eq("id", queueId);

        return NextResponse.json({
          ok: true,
          mode: "preview",
          dryRun: true,
          state: liveState,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Preview failed";
        await supabase
          .from("meta_execution_queue")
          .update({
            last_checked_at: new Date().toISOString(),
            last_checked_state: { error: message },
          })
          .eq("id", queueId);

        return NextResponse.json(
          { ok: false, mode: "preview", error: message },
          { status: 500 }
        );
      }
    }

    // -----------------------------------------------------------------------
    // EXECUTE — the real thing.
    // -----------------------------------------------------------------------
    if (action === "execute") {
      // Must be approved.
      if (row.status !== "approved") {
        return NextResponse.json(
          {
            ok: false,
            error: `Cannot execute row in status ${row.status} — must be 'approved'`,
          },
          { status: 409 }
        );
      }

      // 2. TTL guard.
      try {
        assertQueueItemFresh(row.created_at);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Stale row";
        await supabase
          .from("meta_execution_queue")
          .update({ status: "failed", execution_error: message })
          .eq("id", queueId);
        return NextResponse.json({ ok: false, error: message }, { status: 409 });
      }

      // 3. Per-action database-aware guards.
      if (row.decision_type === "duplicate_ad" && row.ad_meta_id) {
        try {
          await assertNoRecentDuplicate(supabase, row.ad_meta_id);
        } catch (err) {
          const message = err instanceof Error ? err.message : "Cooldown hit";
          await supabase
            .from("meta_execution_queue")
            .update({ status: "failed", execution_error: message })
            .eq("id", queueId);
          return NextResponse.json({ ok: false, error: message }, { status: 409 });
        }
      }

      // 4. Re-fetch state and persist last_checked_* before the write —
      // so even if the write itself fails we have a record of what we
      // saw immediately before.
      let liveStateBefore: unknown = null;
      try {
        liveStateBefore = await refreshState(row);
        await supabase
          .from("meta_execution_queue")
          .update({
            last_checked_at: new Date().toISOString(),
            last_checked_state: liveStateBefore,
          })
          .eq("id", queueId);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Pre-execute state refresh failed";
        await supabase
          .from("meta_execution_queue")
          .update({
            status: "failed",
            execution_error: message,
            last_checked_at: new Date().toISOString(),
            last_checked_state: { error: message },
          })
          .eq("id", queueId);
        return NextResponse.json({ ok: false, error: message }, { status: 502 });
      }

      // 5. Run the executor (guards + the actual POST).
      let executorResult: unknown;
      try {
        executorResult = await runExecutor(row);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Executor failed";
        await supabase
          .from("meta_execution_queue")
          .update({
            status: "failed",
            execution_error: message,
            execution_result: { error: message, before: liveStateBefore },
          })
          .eq("id", queueId);
        return NextResponse.json({ ok: false, error: message }, { status: 502 });
      }

      // 6. Mark executed. Note we record the result whether dry-run or not —
      // dry-run rows can later be inspected to confirm what would have shipped.
      const { error: markErr } = await supabase
        .from("meta_execution_queue")
        .update({
          status: "executed",
          executed_at: new Date().toISOString(),
          execution_result: executorResult as Record<string, unknown>,
          execution_error: null,
        })
        .eq("id", queueId);

      if (markErr) {
        // The Meta write succeeded but we couldn't persist the result —
        // surface this loudly so the operator goes and reconciles by hand.
        return NextResponse.json(
          {
            ok: false,
            error: `Meta write succeeded but DB update failed: ${markErr.message}`,
            executorResult,
          },
          { status: 500 }
        );
      }

      // 7. Best-effort: re-sync our local row from Meta after a successful
      // live write so the rest of the app sees the new state without
      // waiting for the next full sync. We swallow errors here — the
      // execution itself is complete; this is just a freshness nicety.
      if (!isDryRun()) {
        try {
          if (row.decision_type === "pause_ad" && row.ad_id) {
            await supabase
              .from("ads")
              .update({
                status: "paused",
                meta_effective_status: "PAUSED",
                meta_configured_status: "PAUSED",
              })
              .eq("id", row.ad_id);
          } else if (
            row.decision_type === "increase_adset_budget" &&
            executorResult &&
            typeof executorResult === "object" &&
            "newBudgetCents" in executorResult
          ) {
            // Adset-level only — we don't currently store adsets locally,
            // so there's nothing to update here. Left as a hook for when
            // an adsets table lands.
          }
        } catch {
          // Ignore — DB freshness is best-effort.
        }
      }

      return NextResponse.json({
        ok: true,
        status: "executed",
        dryRun: isDryRun(),
        result: executorResult,
      });
    }

    return NextResponse.json(
      { ok: false, error: `Unknown action ${action}` },
      { status: 400 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("meta-execute-decision error:", err, "queueId=", queueId);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
