import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Pattern classification — the tricky part.
//
// Each action_learning row is free text (problem, action_taken, learning,
// tags). We need to bucket them into a small set of patterns so we can
// aggregate across clients.
//
// Strategy:
//   1. Classify by pattern_type (hook/creative/audience/budget/failure/fast_win)
//      using keyword matching on tags first, then on text.
//   2. Within each type, compute a normalised pattern_key that strips
//      specifics but keeps intent (e.g. "test_new_creative_low_ctr").
//   3. Build a human label from the most common action_taken in the group.
// ---------------------------------------------------------------------------

type LearningRow = {
  id: number;
  client_id: number | null;
  problem: string | null;
  action_taken: string | null;
  outcome: string | null;
  learning: string | null;
  tags: string[] | null;
  times_seen: number | null;
  avg_ctr_lift: number | null;
  avg_cpc_change: number | null;
  reliability_score: number | null;
};

type PatternType =
  | "hook"
  | "creative"
  | "audience"
  | "budget"
  | "failure"
  | "fast_win"
  | "other";

function classifyType(row: LearningRow): PatternType {
  const text = `${row.problem ?? ""} ${row.action_taken ?? ""} ${row.learning ?? ""}`.toLowerCase();
  const tags = (row.tags ?? []).map((t) => t.toLowerCase());

  const has = (...keywords: string[]) =>
    keywords.some((k) => tags.includes(k) || text.includes(k));

  // Negative outcomes with enough signal are failures to avoid, regardless
  // of topic — this takes priority so they show up in the failure bucket.
  if (row.outcome === "negative" && (row.times_seen ?? 0) >= 1) {
    return "failure";
  }

  if (has("hook", "headline", "opening line", "copy", "first line")) return "hook";
  if (has("creative", "image", "video", "thumbnail", "visual", "design"))
    return "creative";
  if (has("audience", "targeting", "interest", "lookalike", "demographic"))
    return "audience";
  if (has("budget", "spend", "scale", "bid")) return "budget";

  // Positive outcomes seen few times → fast wins (not proven yet but promising)
  if (row.outcome === "positive" && (row.times_seen ?? 1) <= 2) return "fast_win";

  return "other";
}

function getPatternKey(row: LearningRow, type: PatternType): string {
  const action = (row.action_taken ?? "").toLowerCase();
  const problem = (row.problem ?? "").toLowerCase();

  // Pattern keys within each type — normalise similar phrasings together
  if (type === "hook") {
    if (action.includes("test") || action.includes("new")) return "hook:test_new";
    if (action.includes("change") || action.includes("rewrite")) return "hook:rewrite";
    if (action.includes("shorter") || action.includes("punchy")) return "hook:shorten";
    return "hook:general";
  }

  if (type === "creative") {
    if (action.includes("pause") || action.includes("replace"))
      return "creative:pause_replace";
    if (action.includes("test") || action.includes("new") || action.includes("variation"))
      return "creative:test_new";
    if (action.includes("video")) return "creative:switch_to_video";
    if (action.includes("image")) return "creative:switch_to_image";
    return "creative:general";
  }

  if (type === "audience") {
    if (action.includes("narrow") || action.includes("refine") || action.includes("tight"))
      return "audience:narrow";
    if (action.includes("broaden") || action.includes("lookalike") || action.includes("widen"))
      return "audience:broaden";
    if (action.includes("exclude")) return "audience:exclude";
    return "audience:general";
  }

  if (type === "budget") {
    if (action.includes("increase") || action.includes("scale") || action.includes("boost"))
      return "budget:scale_up";
    if (action.includes("decrease") || action.includes("reduce") || action.includes("cut"))
      return "budget:scale_down";
    if (action.includes("pause")) return "budget:pause";
    return "budget:general";
  }

  if (type === "failure") {
    // Group failures by the problem signature
    if (problem.includes("ctr") || problem.includes("engagement")) return "failure:low_ctr";
    if (problem.includes("cpc") || problem.includes("expensive")) return "failure:high_cpc";
    if (problem.includes("conversion")) return "failure:no_conversions";
    return "failure:general";
  }

  if (type === "fast_win") {
    // Fast wins grouped by the action that produced them
    const firstWords = action.split(/\s+/).slice(0, 3).join("_");
    return `fast_win:${firstWords || "general"}`;
  }

  return `other:${action.split(/\s+/).slice(0, 3).join("_") || "general"}`;
}

function getPatternLabel(type: PatternType, key: string): string {
  const labels: Record<string, string> = {
    "hook:test_new": "Test a new hook",
    "hook:rewrite": "Rewrite the hook",
    "hook:shorten": "Shorten / punch up the hook",
    "hook:general": "Hook changes",
    "creative:pause_replace": "Pause and replace creative",
    "creative:test_new": "Test a new creative variation",
    "creative:switch_to_video": "Switch to video creative",
    "creative:switch_to_image": "Switch to image creative",
    "creative:general": "Creative changes",
    "audience:narrow": "Narrow the audience",
    "audience:broaden": "Broaden the audience",
    "audience:exclude": "Add audience exclusions",
    "audience:general": "Audience changes",
    "budget:scale_up": "Scale budget up on winners",
    "budget:scale_down": "Reduce budget on underperformers",
    "budget:pause": "Pause spend",
    "budget:general": "Budget changes",
    "failure:low_ctr": "Ads that died from low CTR",
    "failure:high_cpc": "Ads that died from expensive clicks",
    "failure:no_conversions": "Ads that never converted",
    "failure:general": "Patterns that failed",
  };
  if (labels[key]) return labels[key];
  // Fall back to prettified key
  return key
    .split(":")[1]
    ?.replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase()) ?? type;
}

// ---------------------------------------------------------------------------

export async function POST() {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      return NextResponse.json({ ok: false, error: "Missing env vars" }, { status: 500 });
    }

    const supabase = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: rawLearnings, error: fetchError } = await supabase
      .from("action_learnings")
      .select(
        "id, client_id, problem, action_taken, outcome, learning, tags, times_seen, avg_ctr_lift, avg_cpc_change, reliability_score"
      );

    if (fetchError) {
      return NextResponse.json(
        { ok: false, error: `Failed to fetch learnings: ${fetchError.message}` },
        { status: 500 }
      );
    }

    const learnings = (rawLearnings ?? []) as LearningRow[];

    if (learnings.length === 0) {
      // Still clear the table so the dashboard reflects reality
      await supabase.from("global_learnings").delete().gt("id", 0);
      return NextResponse.json({ ok: true, generated: 0, message: "No learnings to aggregate yet." });
    }

    // --- Group by pattern_key ---
    type Group = {
      pattern_type: PatternType;
      pattern_key: string;
      pattern_label: string;
      action_candidates: Map<string, number>;
      tag_counts: Map<string, number>;
      client_ids: Set<number>;
      total_times_seen: number;
      positive_count: number;
      neutral_count: number;
      negative_count: number;
      ctr_lifts: number[];
      cpc_changes: number[];
      reliabilities: number[];
      samples: { learning: string; outcome: string; ctr_lift: number | null; client_id: number | null }[];
    };

    const groups = new Map<string, Group>();

    for (const row of learnings) {
      const type = classifyType(row);
      const key = getPatternKey(row, type);

      let g = groups.get(key);
      if (!g) {
        g = {
          pattern_type: type,
          pattern_key: key,
          pattern_label: getPatternLabel(type, key),
          action_candidates: new Map(),
          tag_counts: new Map(),
          client_ids: new Set(),
          total_times_seen: 0,
          positive_count: 0,
          neutral_count: 0,
          negative_count: 0,
          ctr_lifts: [],
          cpc_changes: [],
          reliabilities: [],
          samples: [],
        };
        groups.set(key, g);
      }

      const action = (row.action_taken ?? "").trim();
      if (action) {
        g.action_candidates.set(action, (g.action_candidates.get(action) ?? 0) + 1);
      }

      for (const tag of row.tags ?? []) {
        g.tag_counts.set(tag, (g.tag_counts.get(tag) ?? 0) + 1);
      }

      if (row.client_id !== null && row.client_id !== undefined) {
        g.client_ids.add(row.client_id);
      }

      g.total_times_seen += Number(row.times_seen ?? 1);

      if (row.outcome === "positive") g.positive_count++;
      else if (row.outcome === "negative") g.negative_count++;
      else g.neutral_count++;

      if (row.avg_ctr_lift !== null && row.avg_ctr_lift !== undefined) {
        g.ctr_lifts.push(Number(row.avg_ctr_lift));
      }
      if (row.avg_cpc_change !== null && row.avg_cpc_change !== undefined) {
        g.cpc_changes.push(Number(row.avg_cpc_change));
      }
      if (row.reliability_score !== null && row.reliability_score !== undefined) {
        g.reliabilities.push(Number(row.reliability_score));
      }

      if (g.samples.length < 3 && row.learning) {
        g.samples.push({
          learning: row.learning,
          outcome: row.outcome ?? "neutral",
          ctr_lift: row.avg_ctr_lift !== null ? Number(row.avg_ctr_lift) : null,
          client_id: row.client_id,
        });
      }
    }

    const avg = (arr: number[]): number | null =>
      arr.length > 0 ? Number((arr.reduce((s, v) => s + v, 0) / arr.length).toFixed(2)) : null;

    // --- Build rows and upsert ---
    const rows = Array.from(groups.values()).map((g) => {
      const total = g.positive_count + g.neutral_count + g.negative_count;
      const consistency =
        total > 0 ? Number(((g.positive_count / total) * 100).toFixed(1)) : 0;

      // Pick the most common action text as the canonical action_summary
      const actionSummary =
        Array.from(g.action_candidates.entries())
          .sort((a, b) => b[1] - a[1])[0]?.[0] ?? g.pattern_label;

      // Top 5 tags
      const topTags =
        Array.from(g.tag_counts.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([tag]) => tag);

      return {
        pattern_type: g.pattern_type,
        pattern_key: g.pattern_key,
        pattern_label: g.pattern_label,
        action_summary: actionSummary,
        times_seen: g.total_times_seen,
        unique_clients: g.client_ids.size,
        positive_count: g.positive_count,
        neutral_count: g.neutral_count,
        negative_count: g.negative_count,
        avg_ctr_lift: avg(g.ctr_lifts),
        avg_cpc_change: avg(g.cpc_changes),
        avg_reliability: avg(g.reliabilities),
        consistency_score: consistency,
        sample_learnings: g.samples,
        top_tags: topTags,
        last_updated: new Date().toISOString(),
      };
    });

    // Clear and re-insert — simpler than per-row upsert and ensures
    // stale patterns get cleaned out when learnings are deleted.
    const { error: deleteError } = await supabase
      .from("global_learnings")
      .delete()
      .gt("id", 0);

    if (deleteError) {
      return NextResponse.json(
        { ok: false, error: `Failed to clear existing global learnings: ${deleteError.message}` },
        { status: 500 }
      );
    }

    if (rows.length > 0) {
      const { error: insertError } = await supabase.from("global_learnings").insert(rows);
      if (insertError) {
        return NextResponse.json(
          { ok: false, error: `Insert failed: ${insertError.message}` },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      ok: true,
      generated: rows.length,
      source_learnings: learnings.length,
      breakdown: rows.reduce(
        (acc, r) => {
          acc[r.pattern_type] = (acc[r.pattern_type] ?? 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      ),
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
