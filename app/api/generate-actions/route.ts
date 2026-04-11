import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

type ActionSuggestion = {
  problem: string;
  action: string;
  priority: "high" | "medium" | "low";
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
    };
  }

  if (status === "losing") {
    if (reason.includes("ctr") || reason.includes("low ctr")) {
      return {
        problem: "Low engagement",
        action: "Test new creative (hook, image, headline)",
        priority: "high",
      };
    }

    if (reason.includes("cpc") || reason.includes("expensive")) {
      return {
        problem: "High cost per click",
        action: "Refine audience or improve ad relevance",
        priority: "high",
      };
    }

    if (reason.includes("no conversions")) {
      return {
        problem: "No conversions",
        action: "Fix landing page or improve offer",
        priority: "high",
      };
    }

    return {
      problem: "Underperforming",
      action: "Test new variation",
      priority: "medium",
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

      const { error: insertError } = await supabase.from("ad_actions").insert({
        ad_id: ad.id,
        problem: suggestion.problem,
        action: suggestion.action,
        priority: suggestion.priority,
        status: "pending",
        metric_snapshot_before: snapshot,
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
