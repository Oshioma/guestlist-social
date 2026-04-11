import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

type Learning = {
  id: number;
  problem: string;
  action_taken: string;
  outcome: string;
  learning: string;
  tags: string[] | null;
  times_seen: number;
  reliability_score: number;
  avg_ctr_lift: number;
  avg_cpc_change: number;
};

type PlaybookEntry = {
  category: string;
  insight: string;
  supporting_count: number;
  avg_reliability: number;
  tags: string[];
};

function categorizeAndSummarize(learnings: Learning[]): PlaybookEntry[] {
  const entries: PlaybookEntry[] = [];

  // Only use learnings with some reliability (seen at least once, score > 0)
  const reliable = learnings.filter((l) => l.reliability_score > 10);

  // --- Winning hooks / creative ---
  const winningCreative = reliable.filter(
    (l) =>
      l.outcome === "positive" &&
      (l.tags?.includes("creative") ||
        l.tags?.includes("hook") ||
        l.tags?.includes("ctr") ||
        l.action_taken.toLowerCase().includes("creative") ||
        l.action_taken.toLowerCase().includes("hook") ||
        l.action_taken.toLowerCase().includes("headline"))
  );
  if (winningCreative.length > 0) {
    const avgReliability =
      winningCreative.reduce((s, l) => s + l.reliability_score, 0) / winningCreative.length;
    const bestAction = winningCreative.sort((a, b) => b.reliability_score - a.reliability_score)[0];
    entries.push({
      category: "winning_hooks",
      insight: `Creative changes that work: ${bestAction.action_taken}. Average CTR lift: ${(winningCreative.reduce((s, l) => s + l.avg_ctr_lift, 0) / winningCreative.length).toFixed(1)}%. Confirmed ${winningCreative.reduce((s, l) => s + l.times_seen, 0)} times.`,
      supporting_count: winningCreative.length,
      avg_reliability: Number(avgReliability.toFixed(1)),
      tags: ["creative", "hooks"],
    });
  }

  // --- Winning formats ---
  const winningFormats = reliable.filter(
    (l) =>
      l.outcome === "positive" &&
      (l.tags?.includes("experiment") ||
        l.learning.toLowerCase().includes("carousel") ||
        l.learning.toLowerCase().includes("video") ||
        l.learning.toLowerCase().includes("static") ||
        l.learning.toLowerCase().includes("reel"))
  );
  if (winningFormats.length > 0) {
    const avgReliability =
      winningFormats.reduce((s, l) => s + l.reliability_score, 0) / winningFormats.length;
    const insights = winningFormats.map((l) => l.learning).slice(0, 3);
    entries.push({
      category: "winning_formats",
      insight: insights.join(" | "),
      supporting_count: winningFormats.length,
      avg_reliability: Number(avgReliability.toFixed(1)),
      tags: ["format"],
    });
  }

  // --- Failing patterns ---
  const failingPatterns = reliable.filter((l) => l.outcome === "negative");
  if (failingPatterns.length > 0) {
    const avgReliability =
      failingPatterns.reduce((s, l) => s + l.reliability_score, 0) / failingPatterns.length;
    const topFails = failingPatterns
      .sort((a, b) => b.times_seen - a.times_seen)
      .slice(0, 3);
    entries.push({
      category: "failing_patterns",
      insight: topFails.map((l) => `${l.problem}: ${l.action_taken} did not work (seen ${l.times_seen}x)`).join(". "),
      supporting_count: failingPatterns.length,
      avg_reliability: Number(avgReliability.toFixed(1)),
      tags: ["avoid"],
    });
  }

  // --- Audience insights ---
  const audienceInsights = reliable.filter(
    (l) =>
      l.tags?.includes("targeting") ||
      l.tags?.includes("audience") ||
      l.action_taken.toLowerCase().includes("audience") ||
      l.action_taken.toLowerCase().includes("targeting")
  );
  if (audienceInsights.length > 0) {
    const avgReliability =
      audienceInsights.reduce((s, l) => s + l.reliability_score, 0) / audienceInsights.length;
    const positiveAudience = audienceInsights.filter((l) => l.outcome === "positive");
    const negativeAudience = audienceInsights.filter((l) => l.outcome === "negative");
    const parts: string[] = [];
    if (positiveAudience.length > 0) {
      parts.push(`What works: ${positiveAudience.map((l) => l.action_taken).slice(0, 2).join(", ")}`);
    }
    if (negativeAudience.length > 0) {
      parts.push(`What fails: ${negativeAudience.map((l) => l.action_taken).slice(0, 2).join(", ")}`);
    }
    if (parts.length > 0) {
      entries.push({
        category: "audience_insights",
        insight: parts.join(". "),
        supporting_count: audienceInsights.length,
        avg_reliability: Number(avgReliability.toFixed(1)),
        tags: ["audience", "targeting"],
      });
    }
  }

  // --- Budget rules ---
  const budgetInsights = reliable.filter(
    (l) =>
      l.tags?.includes("budget") ||
      l.action_taken.toLowerCase().includes("budget") ||
      l.action_taken.toLowerCase().includes("scale")
  );
  if (budgetInsights.length > 0) {
    const avgReliability =
      budgetInsights.reduce((s, l) => s + l.reliability_score, 0) / budgetInsights.length;
    const bestBudget = budgetInsights.sort((a, b) => b.reliability_score - a.reliability_score)[0];
    entries.push({
      category: "budget_rules",
      insight: bestBudget.learning,
      supporting_count: budgetInsights.length,
      avg_reliability: Number(avgReliability.toFixed(1)),
      tags: ["budget"],
    });
  }

  return entries;
}

export async function POST(req: Request) {
  try {
    const { clientId } = await req.json();

    if (!clientId) {
      return NextResponse.json({ ok: false, error: "clientId required" }, { status: 400 });
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      return NextResponse.json({ ok: false, error: "Missing env vars" }, { status: 500 });
    }

    const supabase = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Get all learnings for this client
    const { data: learnings, error: fetchError } = await supabase
      .from("action_learnings")
      .select("*")
      .eq("client_id", clientId);

    if (fetchError) {
      return NextResponse.json({ ok: false, error: fetchError.message }, { status: 500 });
    }

    if (!learnings || learnings.length === 0) {
      return NextResponse.json({ ok: true, entries: 0, message: "No learnings yet" });
    }

    const entries = categorizeAndSummarize(
      learnings.map((l) => ({
        id: l.id,
        problem: l.problem ?? "",
        action_taken: l.action_taken ?? "",
        outcome: l.outcome ?? "neutral",
        learning: l.learning ?? "",
        tags: l.tags,
        times_seen: Number(l.times_seen ?? 1),
        reliability_score: Number(l.reliability_score ?? 0),
        avg_ctr_lift: Number(l.avg_ctr_lift ?? 0),
        avg_cpc_change: Number(l.avg_cpc_change ?? 0),
      }))
    );

    if (entries.length === 0) {
      return NextResponse.json({ ok: true, entries: 0, message: "Not enough reliable learnings yet" });
    }

    // Clear old playbook entries for this client and insert fresh
    await supabase.from("client_playbooks").delete().eq("client_id", clientId);

    const { error: insertError } = await supabase.from("client_playbooks").insert(
      entries.map((e) => ({
        client_id: clientId,
        category: e.category,
        insight: e.insight,
        supporting_count: e.supporting_count,
        avg_reliability: e.avg_reliability,
        tags: e.tags,
      }))
    );

    if (insertError) {
      return NextResponse.json({ ok: false, error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, entries: entries.length });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
