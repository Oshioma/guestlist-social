/**
 * GET/POST /api/cross-pollinate
 *
 * Walks every active client, finds creative patterns they're missing
 * (validated by other clients in the same industry), and seeds
 * `duplicate_ad` queue rows pointing at the strongest donor ad. The
 * queue rows land on the TARGET client's queue with full provenance in
 * the reason text.
 *
 * Modes:
 *   GET  → dry-run preview. Runs discovery and returns the suggestions
 *          + stats but writes nothing. Use this from the queue page or
 *          a browser tab to sanity-check before committing.
 *   POST → runs discovery AND seeds queue rows for every suggestion via
 *          seedCrossClientDuplicate. Dedupe is per (target client, donor
 *          ad) so re-running is safe.
 *
 * Auth: service-role supabase. The queue rows still require operator
 * approve+execute before they touch Meta, so the route is safe to expose
 * server-side without extra gating beyond what the rest of the admin API
 * uses.
 *
 * No cron yet — we want operator control over when this runs while we
 * tune the discovery thresholds. Once the dashboard shows positive
 * verdicts on the first batch of cross-pollinated ads, schedule it.
 */

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  discoverPatternMatches,
  seedCrossClientDuplicate,
  MIN_DONOR_IMPRESSIONS,
  MIN_CLIENTS_PER_PATTERN,
  MIN_AVG_CTR,
  MAX_SUGGESTIONS_PER_CLIENT,
} from "@/lib/cross-pollinate";

export const dynamic = "force-dynamic";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY."
    );
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const THRESHOLDS = {
  min_donor_impressions: MIN_DONOR_IMPRESSIONS,
  min_clients_per_pattern: MIN_CLIENTS_PER_PATTERN,
  min_avg_ctr: MIN_AVG_CTR,
  max_suggestions_per_client: MAX_SUGGESTIONS_PER_CLIENT,
};

// ---------------------------------------------------------------------------
// GET — dry-run preview
// ---------------------------------------------------------------------------
export async function GET() {
  try {
    const supabase = getSupabase();
    const result = await discoverPatternMatches(supabase);
    return NextResponse.json({
      ok: true,
      mode: "preview",
      thresholds: THRESHOLDS,
      stats: result.stats,
      suggestions: result.suggestions,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// POST — discover + seed queue rows
// ---------------------------------------------------------------------------
export async function POST() {
  try {
    const supabase = getSupabase();
    const result = await discoverPatternMatches(supabase);

    let seeded = 0;
    let deduped = 0;
    const errors: string[] = [];

    for (const s of result.suggestions) {
      const out = await seedCrossClientDuplicate(supabase, s);
      if (!out.ok) {
        errors.push(
          `target=${s.targetClientName} donor=${s.donorAdMetaId}: ${out.error}`
        );
        continue;
      }
      if (out.deduped) deduped += 1;
      else seeded += 1;
    }

    return NextResponse.json({
      ok: true,
      mode: "seed",
      thresholds: THRESHOLDS,
      stats: result.stats,
      seeded,
      deduped,
      errors: errors.length > 0 ? errors : undefined,
      // Surface the suggestions even on POST so the operator can verify
      // exactly what was queued without a follow-up GET.
      suggestions: result.suggestions,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
