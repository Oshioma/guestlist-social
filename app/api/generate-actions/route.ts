import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

type ActionSuggestion = {
  problem: string;
  action: string;
  priority: "high" | "medium" | "low";
  patternKey?: string;
};

function getActionSuggestion(ad: {
  performance_status: string | null;
  performance_reason: string | null;
}): ActionSuggestion | null {
  const status = ad.performance_status;
  const reason = (ad.performance_reason || "").toLowerCase();

  if (status === "paused") return null;

  if (status === "testing") {
    return {
      problem: "Not enough data",
      action: "Allow ad to run until minimum spend threshold",
      priority: "low",
    };
  }

  if (status === "winner") {
    return {
      problem: "Winning ad",
      action: "Increase budget gradually (20-30%)",
      priority: "medium",
      patternKey: "budget:scale_up",
    };
  }

  if (status === "losing") {
    if (reason.includes("ctr") || reason.includes("low ctr")) {
      return {
        problem: "Low engagement",
        action: "Test new creative (hook, image, headline)",
        priority: "high",
        patternKey: "creative:test_new",
      };
    }

    if (reason.includes("cpc") || reason.includes("expensive")) {
      return {
        problem: "High cost per click",
        action: "Refine audience or improve ad relevance",
        priority: "high",
        patternKey: "audience:narrow",
      };
    }

    if (reason.includes("no conversions")) {
      return {
        problem: "No conversions",
        action: "Fix landing page or improve offer",
        priority: "high",
        patternKey: "failure:no_conversions",
      };
    }

    return {
      problem: "Underperforming",
      action: "Test new variation",
      priority: "medium",
      patternKey: "creative:test_new",
    };
  }

  return null;
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const clientId = body.clientId; // optional: generate for one client only

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        { ok: false, error: "Missing Supabase env vars" },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Fetch ads with full metrics for snapshot
    let adsQuery = supabase
      .from("ads")
      .select("id, name, client_id, performance_status, performance_reason, performance_score, spend, impressions, clicks, conversions, cost_per_result");

    if (clientId) {
      adsQuery = adsQuery.eq("client_id", clientId);
    }

    const { data: ads, error: fetchError } = await adsQuery;

    if (fetchError) {
      return NextResponse.json(
        { ok: false, error: `Failed to fetch ads: ${fetchError.message}` },
        { status: 500 }
      );
    }

    if (!ads || ads.length === 0) {
      return NextResponse.json({ ok: true, generated: 0 });
    }

    // Pull global learnings once so we can enrich suggestions with proof
    // ("Proven across N clients"). Non-breaking: if the table doesn't exist
    // yet or the query fails, we just skip the enrichment.
    const globalByKey = new Map<
      string,
      {
        pattern_label: string;
        unique_clients: number;
        consistency_score: number;
        times_seen: number;
        avg_ctr_lift: number | null;
      }
    >();
    try {
      const { data: globalRows } = await supabase
        .from("global_learnings")
        .select(
          "pattern_key, pattern_label, unique_clients, consistency_score, times_seen, avg_ctr_lift"
        );
      for (const g of globalRows ?? []) {
        globalByKey.set(g.pattern_key as string, {
          pattern_label: g.pattern_label as string,
          unique_clients: Number(g.unique_clients ?? 0),
          consistency_score: Number(g.consistency_score ?? 0),
          times_seen: Number(g.times_seen ?? 0),
          avg_ctr_lift:
            g.avg_ctr_lift !== null && g.avg_ctr_lift !== undefined
              ? Number(g.avg_ctr_lift)
              : null,
        });
      }
    } catch {
      // Best-effort enrichment — ignore any failures.
    }

    function buildValidatedBy(patternKey: string | undefined): string | null {
      if (!patternKey) return null;
      const match = globalByKey.get(patternKey);
      if (!match) return null;
      // Require at least 2 clients and >50% consistency to cite as proof
      if (match.unique_clients < 2 || match.consistency_score < 50) return null;
      const liftBit =
        match.avg_ctr_lift !== null && match.avg_ctr_lift !== 0
          ? `, avg CTR ${match.avg_ctr_lift > 0 ? "+" : ""}${match.avg_ctr_lift.toFixed(1)}%`
          : "";
      return `Proven across ${match.unique_clients} client${
        match.unique_clients === 1 ? "" : "s"
      } (${match.consistency_score.toFixed(0)}% success${liftBit})`;
    }

    let generated = 0;
    let skipped = 0;
    const priorityBreakdown = { high: 0, medium: 0, low: 0 };
    const topActions: { ad_name: string; problem: string; action: string; priority: string }[] = [];
    const errors: string[] = [];

    for (const ad of ads) {
      const suggestion = getActionSuggestion({
        performance_status: ad.performance_status,
        performance_reason: ad.performance_reason,
      });

      if (!suggestion) {
        skipped++;
        continue;
      }

      // Check if there's already a pending action for this ad with the same problem
      const { data: existing } = await supabase
        .from("ad_actions")
        .select("id")
        .eq("ad_id", ad.id)
        .eq("problem", suggestion.problem)
        .eq("status", "pending")
        .limit(1);

      if (existing && existing.length > 0) {
        skipped++;
        continue;
      }

      // Capture before-snapshot at action creation time
      const impressions = Number(ad.impressions ?? 0);
      const clicks = Number(ad.clicks ?? 0);
      const spend = Number(ad.spend ?? 0);
      const snapshot = {
        spend,
        impressions,
        clicks,
        ctr: impressions > 0 ? Number(((clicks / impressions) * 100).toFixed(2)) : 0,
        cpc: clicks > 0 ? Number((spend / clicks).toFixed(4)) : 0,
        conversions: Number(ad.conversions ?? 0),
        cost_per_result: Number(ad.cost_per_result ?? 0),
        performance_status: ad.performance_status,
        performance_score: ad.performance_score,
        captured_at: new Date().toISOString(),
      };

      const validatedBy = buildValidatedBy(suggestion.patternKey);

      const { error: insertError } = await supabase.from("ad_actions").insert({
        ad_id: ad.id,
        problem: suggestion.problem,
        action: suggestion.action,
        priority: suggestion.priority,
        status: "pending",
        metric_snapshot_before: snapshot,
        validated_by: validatedBy,
        validated_pattern_key: suggestion.patternKey ?? null,
      });

      if (insertError) {
        errors.push(`Ad ${ad.id} (${ad.name}): ${insertError.message}`);
      } else {
        generated++;
        priorityBreakdown[suggestion.priority]++;
        if (topActions.length < 5) {
          topActions.push({
            ad_name: ad.name ?? "Unknown ad",
            problem: suggestion.problem,
            action: suggestion.action,
            priority: suggestion.priority,
          });
        }
      }
    }

    // Sort top actions: high first, then medium, then low
    const priorityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
    topActions.sort((a, b) => (priorityOrder[a.priority] ?? 2) - (priorityOrder[b.priority] ?? 2));

    return NextResponse.json({
      ok: true,
      generated,
      skipped,
      total: ads.length,
      priorityBreakdown,
      topActions,
      errors: errors.length > 0 ? errors : undefined,
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
