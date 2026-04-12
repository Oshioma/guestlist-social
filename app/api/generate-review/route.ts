import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// /api/generate-review
//
// POST { client_id, period_type?, period_start?, period_end? }
//
// Builds a deterministic, human-readable review of a client's ads for the
// given window. Pulls real numbers from ads, ad_snapshots, ad_actions,
// ad_decisions, experiments, and global_learnings, then writes one row in
// `reviews` plus N rows in `review_approvals` (one per "what next" item).
//
// Everything here is templated — no LLM. Sentences are built from real
// numbers so the review is trustworthy from day one. The LLM rewrite layer
// can swap in later by post-processing the same JSON blocks.
// ---------------------------------------------------------------------------

type Period = {
  type: "weekly" | "monthly" | "adhoc";
  start: string; // YYYY-MM-DD
  end: string;   // YYYY-MM-DD
  label: string;
};

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env vars");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function defaultPeriod(): Period {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 6);
  const label = `Week of ${start.toLocaleDateString("en-GB", {
    month: "short",
    day: "numeric",
  })}`;
  return { type: "weekly", start: isoDate(start), end: isoDate(end), label };
}

function buildPeriod(body: {
  period_type?: string;
  period_start?: string;
  period_end?: string;
}): Period {
  if (body.period_start && body.period_end) {
    const s = new Date(body.period_start);
    const e = new Date(body.period_end);
    const label =
      body.period_type === "monthly"
        ? s.toLocaleDateString("en-GB", { month: "long", year: "numeric" })
        : `${s.toLocaleDateString("en-GB", {
            month: "short",
            day: "numeric",
          })} – ${e.toLocaleDateString("en-GB", {
            month: "short",
            day: "numeric",
          })}`;
    return {
      type:
        (body.period_type as "weekly" | "monthly" | "adhoc") ?? "adhoc",
      start: body.period_start,
      end: body.period_end,
      label,
    };
  }
  return defaultPeriod();
}

// Sums for an array of snapshot rows scoped to a window.
function sumSnapshots(
  rows: { spend: number; impressions: number; clicks: number }[]
) {
  return rows.reduce(
    (acc, r) => {
      acc.spend += Number(r.spend ?? 0);
      acc.impressions += Number(r.impressions ?? 0);
      acc.clicks += Number(r.clicks ?? 0);
      return acc;
    },
    { spend: 0, impressions: 0, clicks: 0 }
  );
}

function pct(a: number, b: number): number {
  if (b === 0) return 0;
  return ((a - b) / b) * 100;
}

function fmtMoney(n: number, currency = "£"): string {
  if (n >= 1000) return `${currency}${(n / 1000).toFixed(1)}k`;
  return `${currency}${n.toFixed(0)}`;
}

// Supabase joined relations come back as either an object or an array
// depending on whether the join is one-to-one or one-to-many. Normalise.
function relName(rel: unknown): string | null {
  if (!rel) return null;
  if (Array.isArray(rel)) {
    const first = rel[0] as { name?: string } | undefined;
    return first?.name ?? null;
  }
  return (rel as { name?: string }).name ?? null;
}

function laymanDirection(
  metric: string,
  delta: number,
  lowerIsBetter: boolean
): string {
  if (delta === 0) return "stayed flat";
  const better = lowerIsBetter ? delta < 0 : delta > 0;
  const mag = Math.abs(delta);
  const intensity =
    mag >= 50 ? "much" : mag >= 25 ? "noticeably" : mag >= 10 ? "" : "slightly";
  const verb = better ? "better" : "worse";
  const wordMap: Record<string, [string, string]> = {
    "Cost per click": ["cheaper", "more expensive"],
    "Cost per lead": ["cheaper", "more expensive"],
    "Click rate": ["more people clicked", "fewer people clicked"],
    Reach: ["more new people seeing it", "fewer new people seeing it"],
    Spend: ["spent more", "spent less"],
    Clicks: ["more clicks", "fewer clicks"],
  };
  const w = wordMap[metric];
  if (w) return `${intensity ? intensity + " " : ""}${better ? w[0] : w[1]}`.trim();
  return `${intensity ? intensity + " " : ""}${verb}`.trim();
}

// ---------------------------------------------------------------------------

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const clientIdRaw = body.client_id ?? body.clientId;
    if (!clientIdRaw) {
      return NextResponse.json(
        { ok: false, error: "client_id is required" },
        { status: 400 }
      );
    }
    const clientId = Number(clientIdRaw);
    const period = buildPeriod(body);

    const supabase = admin();

    // -----------------------------------------------------------------------
    // 1. Pull everything we need in parallel
    // -----------------------------------------------------------------------
    const priorEnd = new Date(period.start);
    priorEnd.setDate(priorEnd.getDate() - 1);
    const priorStart = new Date(priorEnd);
    const days =
      Math.round(
        (new Date(period.end).getTime() - new Date(period.start).getTime()) /
          (1000 * 60 * 60 * 24)
      ) + 1;
    priorStart.setDate(priorEnd.getDate() - (days - 1));

    const [
      clientRes,
      adsRes,
      snapsCurRes,
      snapsPrevRes,
      actionsRes,
      decisionsRes,
      experimentsRes,
      learningsRes,
      placementRes,
    ] = await Promise.all([
      supabase
        .from("clients")
        .select("id, name")
        .eq("id", clientId)
        .single(),
      supabase
        .from("ads")
        .select(
          "id, name, status, performance_status, performance_reason, spend, clicks, impressions, ctr, cpc, conversions, frequency, cpm, quality_ranking, engagement_rate_ranking, conversion_rate_ranking"
        )
        .eq("client_id", clientId),
      supabase
        .from("ad_snapshots")
        .select("ad_id, spend, impressions, clicks, captured_at")
        .eq("client_id", clientId)
        .gte("captured_at", period.start)
        .lte("captured_at", period.end),
      supabase
        .from("ad_snapshots")
        .select("ad_id, spend, impressions, clicks, captured_at")
        .eq("client_id", clientId)
        .gte("captured_at", isoDate(priorStart))
        .lte("captured_at", isoDate(priorEnd)),
      supabase
        .from("ad_actions")
        .select(
          "id, ad_id, problem, action, priority, status, outcome, result_summary, hypothesis, validated_by, validated_pattern_key, completed_at, created_at, ads!inner(name, client_id)"
        )
        .eq("ads.client_id", clientId)
        .order("created_at", { ascending: false }),
      supabase
        .from("ad_decisions")
        .select("id, ad_id, type, reason, action, confidence, status, created_at")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("experiments")
        .select("id, name, hypothesis, status, result, created_at")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from("global_learnings")
        .select(
          "pattern_type, pattern_key, pattern_label, action_summary, unique_clients, consistency_score, avg_ctr_lift, times_seen"
        )
        .order("consistency_score", { ascending: false }),
      supabase
        .from("ad_placement_insights")
        .select("publisher_platform, platform_position, impressions, clicks, spend, ctr")
        .eq("client_id", clientId)
        .gte("date_start", period.start)
        .lte("date_stop", period.end),
    ]);

    if (clientRes.error || !clientRes.data) {
      return NextResponse.json(
        { ok: false, error: "Client not found" },
        { status: 404 }
      );
    }

    const ads = adsRes.data ?? [];
    const snapsCur = snapsCurRes.data ?? [];
    const snapsPrev = snapsPrevRes.data ?? [];
    const actions = actionsRes.data ?? [];
    const decisions = decisionsRes.data ?? [];
    const experiments = experimentsRes.data ?? [];
    const learnings = learningsRes.data ?? [];
    const placements = placementRes.data ?? [];

    // -----------------------------------------------------------------------
    // 2. Compute period totals + deltas
    // -----------------------------------------------------------------------
    const cur = sumSnapshots(snapsCur);
    const prev = sumSnapshots(snapsPrev);
    const curCtr = cur.impressions > 0 ? (cur.clicks / cur.impressions) * 100 : 0;
    const prevCtr = prev.impressions > 0 ? (prev.clicks / prev.impressions) * 100 : 0;
    const curCpc = cur.clicks > 0 ? cur.spend / cur.clicks : 0;
    const prevCpc = prev.clicks > 0 ? prev.spend / prev.clicks : 0;

    // Conversions in window come from ads.conversions for ads that ran
    // (we don't currently keep daily conversion snapshots — extension point)
    const curConversions = ads.reduce((s, a) => s + Number(a.conversions ?? 0), 0);
    const cpa =
      curConversions > 0 ? cur.spend / curConversions : null;

    // -----------------------------------------------------------------------
    // 3. Headline
    // -----------------------------------------------------------------------
    const ctrDelta = pct(curCtr, prevCtr);
    const cpcDelta = pct(curCpc, prevCpc);
    const spendDelta = pct(cur.spend, prev.spend);

    // Score the period: positive if CTR up or CPC down, negative if both bad.
    let score = 0;
    if (curCtr > prevCtr) score++;
    if (curCpc < prevCpc) score++;
    if (curCtr < prevCtr) score--;
    if (curCpc > prevCpc) score--;

    let headline: string;
    if (score >= 1 && cur.spend > 0) headline = "Things are improving.";
    else if (score <= -1 && cur.spend > 0) headline = "We hit some friction this week.";
    else if (cur.spend === 0) headline = "Quiet period — no spend to report.";
    else headline = "Holding steady.";

    const subheadParts: string[] = [];
    if (cur.spend > 0) {
      subheadParts.push(`You spent ${fmtMoney(cur.spend)}`);
      subheadParts.push(`got ${cur.clicks.toLocaleString()} clicks`);
      if (curConversions > 0) {
        subheadParts.push(
          `and ${curConversions.toLocaleString()} result${curConversions === 1 ? "" : "s"}${
            cpa ? ` at ${fmtMoney(cpa)} each` : ""
          }`
        );
      }
    }
    let subhead = subheadParts.join(", ");
    if (cpcDelta < -5) subhead += `, ${Math.abs(cpcDelta).toFixed(0)}% cheaper than last week`;
    else if (cpcDelta > 5) subhead += `, ${cpcDelta.toFixed(0)}% pricier than last week`;
    if (subhead) subhead += ".";

    // -----------------------------------------------------------------------
    // 4. What happened — paragraph
    // -----------------------------------------------------------------------
    const adCount = ads.length;
    const winnerCount = ads.filter((a) => a.performance_status === "winner").length;
    const losingCount = ads.filter((a) => a.performance_status === "losing").length;

    // Top placement contribution
    const placementTotals = new Map<
      string,
      { impressions: number; clicks: number; spend: number }
    >();
    for (const p of placements) {
      const key = `${p.publisher_platform ?? "?"} ${p.platform_position ?? ""}`.trim();
      const existing = placementTotals.get(key) ?? {
        impressions: 0,
        clicks: 0,
        spend: 0,
      };
      existing.impressions += Number(p.impressions ?? 0);
      existing.clicks += Number(p.clicks ?? 0);
      existing.spend += Number(p.spend ?? 0);
      placementTotals.set(key, existing);
    }
    const topPlacement = Array.from(placementTotals.entries()).sort(
      (a, b) => b[1].clicks - a[1].clicks
    )[0];

    const happenedParts: string[] = [];
    happenedParts.push(
      `We ran ${adCount} ad${adCount === 1 ? "" : "s"} this period.`
    );
    if (winnerCount > 0)
      happenedParts.push(
        `${winnerCount} ${winnerCount === 1 ? "is" : "are"} pulling its weight.`
      );
    if (losingCount > 0)
      happenedParts.push(
        `${losingCount} ${losingCount === 1 ? "needs" : "need"} attention.`
      );
    if (topPlacement && topPlacement[1].clicks > 0) {
      happenedParts.push(
        `Most of the action came from ${topPlacement[0]}.`
      );
    }
    if (Math.abs(spendDelta) >= 10) {
      happenedParts.push(
        `Spend was ${spendDelta > 0 ? "up" : "down"} ${Math.abs(spendDelta).toFixed(0)}% on the prior week.`
      );
    }
    const whatHappened = happenedParts.join(" ");

    // -----------------------------------------------------------------------
    // 5. What improved — metric cards
    // -----------------------------------------------------------------------
    type ImprovementCard = {
      metric: string;
      before: string;
      after: string;
      delta_pct: number;
      direction: "up" | "down" | "flat";
      layman: string;
    };

    const cards: ImprovementCard[] = [];
    function pushCard(
      metric: string,
      before: number,
      after: number,
      lowerIsBetter: boolean,
      formatter: (n: number) => string = (n) => n.toLocaleString()
    ) {
      if (before === 0 && after === 0) return;
      const delta = pct(after, before);
      const direction =
        Math.abs(delta) < 0.5 ? "flat" : delta > 0 ? "up" : "down";
      cards.push({
        metric,
        before: formatter(before),
        after: formatter(after),
        delta_pct: Number(delta.toFixed(1)),
        direction,
        layman: laymanDirection(metric, delta, lowerIsBetter),
      });
    }

    pushCard("Cost per click", prevCpc, curCpc, true, (n) =>
      n > 0 ? `£${n.toFixed(2)}` : "—"
    );
    pushCard("Click rate", prevCtr, curCtr, false, (n) => `${n.toFixed(2)}%`);
    pushCard("Spend", prev.spend, cur.spend, false, (n) => fmtMoney(n));
    pushCard("Clicks", prev.clicks, cur.clicks, false);

    // -----------------------------------------------------------------------
    // 6. What we tested — completed actions + experiments in window
    // -----------------------------------------------------------------------
    type TestItem = {
      ad_name: string;
      hypothesis: string;
      result: string;
      outcome: "positive" | "neutral" | "negative";
      symbol: "✓" | "•" | "✗";
    };

    const periodStartTs = new Date(period.start).getTime();
    const periodEndTs = new Date(period.end).getTime() + 24 * 60 * 60 * 1000;

    const tested: TestItem[] = [];
    for (const a of actions) {
      if (a.status !== "completed") continue;
      const completedAt = a.completed_at
        ? new Date(a.completed_at).getTime()
        : 0;
      if (completedAt < periodStartTs || completedAt > periodEndTs) continue;
      const outcome =
        (a.outcome as "positive" | "neutral" | "negative" | null) ?? "neutral";
      tested.push({
        ad_name: relName(a.ads) ?? `Ad #${a.ad_id}`,
        hypothesis: a.hypothesis ?? a.action ?? "",
        result: a.result_summary ?? "Logged",
        outcome,
        symbol: outcome === "positive" ? "✓" : outcome === "negative" ? "✗" : "•",
      });
    }

    // -----------------------------------------------------------------------
    // 7. What we learned — global_learnings + matched failures
    // -----------------------------------------------------------------------
    type LearnedItem = {
      insight: string;
      evidence: string;
      pattern_key: string | null;
    };
    const learned: LearnedItem[] = [];

    // Wins worth quoting: high-consistency, multi-client patterns
    for (const l of learnings) {
      if (learned.length >= 4) break;
      if (
        Number(l.consistency_score ?? 0) >= 70 &&
        Number(l.unique_clients ?? 0) >= 2
      ) {
        const liftBit =
          l.avg_ctr_lift && Number(l.avg_ctr_lift) > 0
            ? `lifting clicks by about ${Number(l.avg_ctr_lift).toFixed(0)}%`
            : null;
        learned.push({
          insight: l.pattern_label as string,
          evidence: liftBit
            ? `Worked ${Math.round(Number(l.consistency_score) / 10)} out of 10 times across ${l.unique_clients} clients, ${liftBit}.`
            : `Worked ${Math.round(Number(l.consistency_score) / 10)} out of 10 times across ${l.unique_clients} clients.`,
          pattern_key: l.pattern_key as string,
        });
      }
    }

    // Friction this period that matches a known failure pattern
    const failureLearnings = learnings.filter(
      (l) => (l.pattern_type as string) === "failure"
    );
    for (const fail of failureLearnings.slice(0, 2)) {
      learned.push({
        insight: `Watch out: ${fail.pattern_label}`,
        evidence: `Seen ${fail.times_seen}× across our clients. Catching it early saves spend.`,
        pattern_key: fail.pattern_key as string,
      });
      if (learned.length >= 6) break;
    }

    // -----------------------------------------------------------------------
    // 8. What we did — completed work in window
    // -----------------------------------------------------------------------
    type DidItem = { action: string; ad_name: string; outcome: string };
    const did: DidItem[] = tested.map((t) => ({
      action: t.hypothesis,
      ad_name: t.ad_name,
      outcome: t.outcome,
    }));

    // -----------------------------------------------------------------------
    // 9. What's next — scale / fix / launch / pause groups
    // -----------------------------------------------------------------------
    type NextItem = {
      idx: number;
      label: string;
      detail: string;
      type: "scale" | "fix" | "launch" | "pause" | "budget";
      ad_id: number | null;
      source_action_id: string | null;
      source_decision_id: number | null;
    };

    const next: NextItem[] = [];
    let idx = 0;

    // Pending high-priority actions become "Fix" items
    const pendingActions = actions.filter(
      (a) => a.status === "pending" || a.status === "in_progress"
    );

    for (const a of pendingActions) {
      if (next.length >= 12) break;
      const adName = relName(a.ads) ?? `Ad #${a.ad_id}`;
      const isOpportunity = /winning|winner|scale/i.test(a.problem ?? "");
      const type: NextItem["type"] = isOpportunity ? "scale" : "fix";
      next.push({
        idx: idx++,
        label: `${type === "scale" ? "Scale" : "Fix"} ${adName}`,
        detail: `${a.problem ?? ""} → ${a.action ?? ""}`,
        type,
        ad_id: Number(a.ad_id),
        source_action_id: String(a.id),
        source_decision_id: null,
      });
    }

    // Proposed decisions become "Budget" items
    for (const d of decisions) {
      if (d.status !== "pending") continue;
      if (next.length >= 14) break;
      next.push({
        idx: idx++,
        label: d.action ?? d.type ?? "Budget move",
        detail: d.reason ?? "",
        type: "budget",
        ad_id: d.ad_id ? Number(d.ad_id) : null,
        source_action_id: null,
        source_decision_id: Number(d.id),
      });
    }

    // Up to 2 "Try something new" items from global_learnings the client
    // hasn't tried yet this period
    const triedKeys = new Set(
      actions
        .map((a) => a.validated_pattern_key)
        .filter(Boolean) as string[]
    );
    const launchCandidates = learnings
      .filter(
        (l) =>
          Number(l.consistency_score ?? 0) >= 70 &&
          Number(l.unique_clients ?? 0) >= 2 &&
          !triedKeys.has(l.pattern_key as string)
      )
      .slice(0, 2);

    for (const cand of launchCandidates) {
      next.push({
        idx: idx++,
        label: `Try: ${cand.pattern_label}`,
        detail: `${cand.action_summary} — proven across ${cand.unique_clients} clients.`,
        type: "launch",
        ad_id: null,
        source_action_id: null,
        source_decision_id: null,
      });
    }

    // -----------------------------------------------------------------------
    // 10. Insert review + approval rows
    // -----------------------------------------------------------------------
    const metricsSnapshot = {
      current: { ...cur, ctr: curCtr, cpc: curCpc, conversions: curConversions, cpa },
      prior: { ...prev, ctr: prevCtr, cpc: prevCpc },
      ad_count: adCount,
      winner_count: winnerCount,
      losing_count: losingCount,
      top_placement: topPlacement
        ? { name: topPlacement[0], ...topPlacement[1] }
        : null,
    };

    const { data: review, error: insertError } = await supabase
      .from("reviews")
      .insert({
        client_id: clientId,
        period_label: period.label,
        period_type: period.type,
        period_start: period.start,
        period_end: period.end,
        status: "draft",
        headline,
        subhead,
        what_happened: whatHappened,
        what_improved: cards,
        what_we_tested: tested,
        what_we_learned: learned,
        what_we_did: did,
        what_next: next,
        metrics_snapshot: metricsSnapshot,
      })
      .select("id")
      .single();

    if (insertError || !review) {
      return NextResponse.json(
        { ok: false, error: insertError?.message ?? "Failed to save review" },
        { status: 500 }
      );
    }

    if (next.length > 0) {
      const approvalRows = next.map((n) => ({
        review_id: Number(review.id),
        proposal_index: n.idx,
        proposal_label: n.label,
        proposal_detail: n.detail,
        proposal_type: n.type,
        status: "pending",
      }));
      await supabase.from("review_approvals").insert(approvalRows);
    }

    return NextResponse.json({
      ok: true,
      review_id: Number(review.id),
      counts: {
        improvements: cards.length,
        tested: tested.length,
        learned: learned.length,
        next: next.length,
      },
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
