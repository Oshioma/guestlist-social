/**
 * /api/unretire-pattern — operator override for the stale pattern reaper.
 *
 * The reaper (POST /api/cron/retire-stale-patterns) is a one-way door by
 * default: it stamps retired_at on any pattern_feedback slice with a bad
 * track record, and the engine then refuses to consult that slice. This
 * route is the way back. Operators hit it from the whats-working playbook
 * page when they think a pattern got unfairly retired — usually because
 * the bad streak had an external cause (Meta outage, holiday-week traffic,
 * a competitor stunt) that the engine can't see.
 *
 * Single small action: clear retired_at and retired_reason on the matching
 * pattern_feedback row. Verdict counts stay intact — we don't want the
 * operator to lose the historical evidence, just the disqualification flag.
 * If the pattern's track record is still bad next time the reaper runs,
 * it'll be retired again.
 */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { patternKey, industry } = await req.json();

    if (typeof patternKey !== "string" || patternKey.length === 0) {
      return NextResponse.json(
        { ok: false, error: "patternKey (string) required" },
        { status: 400 }
      );
    }

    // Empty-string industry is the agency-wide sentinel — same convention
    // as pattern_feedback's PK shape, so the operator UI can pass null
    // without us coalescing on the server.
    const industryKey =
      typeof industry === "string" ? industry : industry == null ? "" : "";

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      return NextResponse.json(
        { ok: false, error: "Missing env vars" },
        { status: 500 }
      );
    }

    const supabase = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Read first so we can return a meaningful response when the row
    // doesn't exist or is already active. The dashboard relies on these
    // states to decide whether to show "brought back" or "already active".
    const { data: existing, error: readErr } = await supabase
      .from("pattern_feedback")
      .select("pattern_key, industry, retired_at")
      .eq("pattern_key", patternKey)
      .eq("industry", industryKey)
      .maybeSingle();

    if (readErr) {
      return NextResponse.json(
        { ok: false, error: readErr.message },
        { status: 500 }
      );
    }
    if (!existing) {
      return NextResponse.json(
        { ok: false, error: "No feedback row for that pattern" },
        { status: 404 }
      );
    }
    if (existing.retired_at == null) {
      return NextResponse.json({
        ok: true,
        alreadyActive: true,
        patternKey,
        industry: industryKey,
      });
    }

    const { error: updErr } = await supabase
      .from("pattern_feedback")
      .update({
        retired_at: null,
        retired_reason: null,
        updated_at: new Date().toISOString(),
      })
      .eq("pattern_key", patternKey)
      .eq("industry", industryKey);

    if (updErr) {
      return NextResponse.json(
        { ok: false, error: updErr.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      alreadyActive: false,
      patternKey,
      industry: industryKey,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
