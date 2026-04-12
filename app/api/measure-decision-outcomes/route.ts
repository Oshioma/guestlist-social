/**
 * GET/POST /api/measure-decision-outcomes
 *
 * Periodic sweep that resolves `decision_outcomes` rows whose follow-up
 * window has elapsed. For each due row it pulls the current ad metrics
 * (whatever meta-sync last wrote), computes the lift vs. the baseline
 * captured at execute time, classifies a verdict, and marks the row
 * `measured`.
 *
 * This is the second half of the prediction loop — without it the engine
 * is shipping recommendations into the void. With it, every executed
 * queue row gets paired with a measured outcome that the dashboard can
 * surface as "decisions executed last 30d · 67% positive".
 *
 * Trigger options (any of):
 *   - Vercel cron: `*\/30 * * * *` (every 30 minutes — measurement is
 *     idempotent and only resolves rows whose follow-up window has
 *     elapsed, so frequent sweeps are cheap and self-throttling).
 *   - Manual: `curl -X POST .../api/measure-decision-outcomes`
 *   - GET is also supported for browser-based one-shots during ops.
 *
 * Auth: requires the same service-role env vars as the rest of the
 * server-only routes. The route is not reachable from the public site
 * because the admin app is gated by client_user_links.
 */

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { measureDueOutcomes } from "@/lib/decision-outcomes";

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

async function runSweep() {
  const supabase = getSupabase();
  const result = await measureDueOutcomes(supabase, { limit: 100 });
  return result;
}

export async function POST() {
  try {
    const result = await runSweep();
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET() {
  // Mirror POST so the route is also browser-pokeable during ops. The
  // sweep is read-mostly and idempotent, so allowing GET doesn't open a
  // CSRF surface.
  return POST();
}
