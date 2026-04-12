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
  | "creative_format"
  | "creative_hook"
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

// Recency window. Patterns are computed from data inside this window only —
// keeps the playbook from being dragged around by 6-month-old learnings or
// archived ad inventory. Action learnings are filtered by their created_at;
// ads are filtered by meta_effective_status (we drop ARCHIVED/DELETED so the
// creative buckets reflect currently-live or recently-paused inventory).
//
// This is the *single* knob that controls "how current is the playbook".
// Bumping it means slower to react but more statistical power; lowering it
// means more responsive but more volatile.
const GENERATOR_WINDOW_DAYS = 90;

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

    const windowStartIso = new Date(
      Date.now() - GENERATOR_WINDOW_DAYS * 24 * 60 * 60 * 1000
    ).toISOString();

    const { data: rawLearnings, error: fetchError } = await supabase
      .from("action_learnings")
      .select(
        "id, client_id, problem, action_taken, outcome, learning, tags, times_seen, avg_ctr_lift, avg_cpc_change, reliability_score"
      )
      .gte("created_at", windowStartIso);

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
      // Industry slice this group belongs to. null = cross-industry
      // (the original behaviour). When non-null, the group only contains
      // learnings from clients tagged with that industry.
      industry: string | null;
    };

    // Industry lookup for action patterns. We need this *before* the
    // grouping loop so each learning can be slotted into its per-industry
    // bucket as well as the cross-industry one. The creative-aggregation
    // block below uses the same lookup — extracted up here so it's loaded
    // exactly once per request.
    const { data: clientsForIndustry } = await supabase
      .from("clients")
      .select("id, industry");
    const industryByClient = new Map<number, string | null>();
    for (const c of (clientsForIndustry ?? []) as {
      id: number;
      industry: string | null;
    }[]) {
      industryByClient.set(c.id, c.industry ?? null);
    }

    const groups = new Map<string, Group>();

    // Helper: get-or-create a group for a (pattern_key, industry) slice.
    // Cross-industry rows use industry=null and key=pattern_key. Per-
    // industry rows use industry=<name> and key=`${pattern_key}|${name}`
    // — same composite-key shape we use for pattern_feedback lookups.
    function ensureGroup(
      type: PatternType,
      key: string,
      label: string,
      industry: string | null
    ): Group {
      const slotKey = industry ? `${key}|${industry}` : key;
      let g = groups.get(slotKey);
      if (!g) {
        g = {
          pattern_type: type,
          pattern_key: key,
          pattern_label: industry ? `${label} · ${formatIndustry(industry)}` : label,
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
          industry,
        };
        groups.set(slotKey, g);
      }
      return g;
    }

    // Defined here (above ensureGroup's first call) so the per-industry
    // label suffix can use it. The creative-aggregation block below also
    // uses this; both call sites end up with consistent capitalisation.
    function formatIndustry(ind: string): string {
      // Operators can type freeform — capitalize first letter, leave the
      // rest alone so multi-word entries like "real estate" don't lose
      // their spacing.
      return ind.charAt(0).toUpperCase() + ind.slice(1);
    }

    function pushLearning(g: Group, row: LearningRow) {
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

    for (const row of learnings) {
      const type = classifyType(row);
      const key = getPatternKey(row, type);
      const label = getPatternLabel(type, key);

      // Always add to the cross-industry slice — this preserves the
      // existing agency-wide playbook view.
      pushLearning(ensureGroup(type, key, label, null), row);

      // Then, if the learning's client has a known industry, also add it
      // to the per-industry slice. Learnings whose client has no industry
      // tag (or no client_id at all) only contribute to the cross-industry
      // pass. This is the same rule the creative-aggregation block uses.
      const learningIndustry =
        row.client_id != null
          ? industryByClient.get(row.client_id) ?? null
          : null;
      if (learningIndustry) {
        pushLearning(ensureGroup(type, key, label, learningIndustry), row);
      }
    }

    const avg = (arr: number[]): number | null =>
      arr.length > 0 ? Number((arr.reduce((s, v) => s + v, 0) / arr.length).toFixed(2)) : null;

    // ----------------------------------------------------------------------
    // Pattern feedback ledger — fold engine-driven verdicts into the
    // operator-recorded counts before computing consistency_score. This is
    // the "outcome → pattern" half of the prediction loop: when the engine
    // takes a pattern-backed action and measureDueOutcomes records a
    // verdict, that verdict lives in pattern_feedback. Here we add it to
    // the operator action_learnings counts so the next decision generation
    // sees the engine's own track record reflected in the score.
    //
    // Action patterns are always industry=null in this builder (the
    // creative-attribute pass below has its own industry handling). We
    // look up feedback rows with industry='' (the agency-wide sentinel).
    // ----------------------------------------------------------------------
    const { data: feedbackRows } = await supabase
      .from("pattern_feedback")
      .select(
        "pattern_key, industry, positive_verdicts, negative_verdicts, neutral_verdicts"
      );

    type FeedbackBuckets = {
      positive: number;
      negative: number;
      neutral: number;
    };
    const feedbackByKey = new Map<string, FeedbackBuckets>();
    for (const f of feedbackRows ?? []) {
      // Composite key: pattern_key|industry. Empty industry means
      // agency-wide.
      const k = `${f.pattern_key}|${f.industry ?? ""}`;
      feedbackByKey.set(k, {
        positive: Number(f.positive_verdicts ?? 0),
        negative: Number(f.negative_verdicts ?? 0),
        neutral: Number(f.neutral_verdicts ?? 0),
      });
    }

    // --- Build rows and upsert ---
    // Per-industry slices need a higher signal floor than the cross-
    // industry view: a single learning from a one-client industry would
    // otherwise show up as a 100% consistency win. We require at least
    // 2 source learnings before emitting a per-industry row. Cross-
    // industry rows keep the old behaviour (any data shows up).
    const MIN_LEARNINGS_PER_INDUSTRY_SLICE = 2;

    const rows = Array.from(groups.values())
      .filter((g) => {
        if (g.industry === null) return true;
        const total = g.positive_count + g.neutral_count + g.negative_count;
        return total >= MIN_LEARNINGS_PER_INDUSTRY_SLICE;
      })
      .map((g) => {
        // Look up the matching pattern_feedback slice. Cross-industry
        // groups read the agency-wide ('') bucket; per-industry groups
        // read their own slice. The composite key shape is the same one
        // the engine seeder writes with — see seedFromPattern.
        const fbKey = `${g.pattern_key}|${g.industry ?? ""}`;
        const fb = feedbackByKey.get(fbKey);
        const positive = g.positive_count + (fb?.positive ?? 0);
        const negative = g.negative_count + (fb?.negative ?? 0);
        const neutral = g.neutral_count + (fb?.neutral ?? 0);
        const total = positive + neutral + negative;
        const consistency =
          total > 0 ? Number(((positive / total) * 100).toFixed(1)) : 0;

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
          // Pattern key stays the bare key (no industry suffix) so the
          // playbook UI and pattern_feedback joins can find both the
          // cross-industry and per-industry rows under the same identifier.
          // Industry slicing is carried in the `industry` column.
          pattern_key: g.pattern_key,
          pattern_label: g.pattern_label,
          action_summary: actionSummary,
          times_seen: g.total_times_seen,
          unique_clients: g.client_ids.size,
          positive_count: positive,
          neutral_count: neutral,
          negative_count: negative,
          avg_ctr_lift: avg(g.ctr_lifts),
          avg_cpc_change: avg(g.cpc_changes),
          avg_reliability: avg(g.reliabilities),
          consistency_score: consistency,
          sample_learnings: g.samples,
          top_tags: topTags,
          industry: g.industry,
          last_updated: new Date().toISOString(),
        };
      });

    // -----------------------------------------------------------------------
    // Cross-client creative aggregation.
    //
    // The action_learnings groups above describe what operators *did*. The
    // block below describes what's actually working in the live ad data,
    // bucketed by creative attributes (hook_type, format_style) — these
    // are the columns the meta-creative-trust-layer added on the ads
    // table.
    //
    // Two passes:
    //   1. Cross-industry — every bucket compared against the global mean
    //      CTR. Emits rows with industry=null. These power the agency-wide
    //      hero card.
    //   2. Per-industry — every bucket also segmented by the client's
    //      industry, compared against that industry's own mean CTR. Emits
    //      rows with industry=<industry>. These power the industry filter
    //      on the playbook page and avoid the bias of comparing
    //      hospitality CTR against e-commerce CTR.
    //
    // A bucket emits a row when:
    //   - the bucket has impressions from at least 2 distinct clients
    //   - the bucket has at least 5 ads in it
    //   - the lift vs the relevant baseline is >= 15% in either direction
    //
    // The thresholds are deliberately conservative — we want this to be
    // the agency-level edge, not noise about a 2% CTR gap on n=3.
    // -----------------------------------------------------------------------
    const MIN_IMPRESSIONS = 200;
    const MIN_ADS_PER_BUCKET = 5;
    const MIN_UNIQUE_CLIENTS = 2;
    const MIN_LIFT_PCT = 15;

    // industryByClient + formatIndustry are now defined above (alongside
    // the action-pattern grouping pass) so both pipelines share a single
    // clients(id, industry) read. Reusing the same map here keeps the
    // baseline math identical between the two passes.

    type CreativeAdRow = {
      id: number;
      client_id: number | null;
      hook_type: string | null;
      format_style: string | null;
      impressions: number | null;
      clicks: number | null;
      meta_effective_status: string | null;
    };

    // Skip dead inventory — ARCHIVED and DELETED ads represent stuff that's
    // no longer running, so their CTR shouldn't influence "what's working
    // right now". `meta_effective_status` is null on rows that were never
    // synced from Meta, so we filter via .not().in() rather than a positive
    // include list (keeps locally-created or partially-synced ads).
    const { data: rawAds } = await supabase
      .from("ads")
      .select(
        "id, client_id, hook_type, format_style, impressions, clicks, meta_effective_status"
      )
      .not("meta_effective_status", "in", "(ARCHIVED,DELETED)");
    const adRows = (rawAds ?? []) as CreativeAdRow[];

    function ctrOf(ad: CreativeAdRow): number | null {
      const imp = Number(ad.impressions ?? 0);
      const clk = Number(ad.clicks ?? 0);
      if (imp < MIN_IMPRESSIONS) return null;
      return (clk / imp) * 100;
    }

    // Global mean CTR over every ad with enough impressions — the
    // baseline cross-industry buckets are compared against.
    const allCtrs = adRows
      .map((a) => ctrOf(a))
      .filter((v): v is number => v !== null);
    const globalMeanCtr =
      allCtrs.length > 0
        ? allCtrs.reduce((s, v) => s + v, 0) / allCtrs.length
        : 0;

    // Per-industry baselines. Each industry gets its own mean CTR so that
    // an industry-specific bucket is judged against its own peers, not
    // against the agency average. Industries with no qualifying ads fall
    // through to the global baseline.
    const industryCtrs = new Map<string, number[]>();
    for (const ad of adRows) {
      const ctr = ctrOf(ad);
      if (ctr == null) continue;
      if (ad.client_id == null) continue;
      const ind = industryByClient.get(ad.client_id);
      if (!ind) continue;
      if (!industryCtrs.has(ind)) industryCtrs.set(ind, []);
      industryCtrs.get(ind)!.push(ctr);
    }
    const industryMeanCtr = new Map<string, number>();
    for (const [ind, ctrs] of industryCtrs) {
      industryMeanCtr.set(
        ind,
        ctrs.reduce((s, v) => s + v, 0) / ctrs.length
      );
    }

    type CreativeBucket = {
      pattern_type: "creative_format" | "creative_hook";
      pattern_key: string;
      pattern_label: string;
      ctrs: number[];
      client_ids: Set<number>;
      ad_count: number;
      industry: string | null;
    };

    // The map is keyed on a synthetic slot string that combines pattern_key
    // + industry, but the bucket itself stores the *bare* pattern_key. The
    // composite uniqueness lives in global_learnings via the new
    // (pattern_key, COALESCE(industry,'')) unique index added in
    // 20260420_global_learnings_industry_composite.sql — so we no longer
    // encode industry into the key string.
    const creativeBuckets = new Map<string, CreativeBucket>();

    function addToBucket(
      patternKey: string,
      type: "creative_format" | "creative_hook",
      label: string,
      ad: CreativeAdRow,
      ctr: number,
      industry: string | null
    ) {
      const slotKey = `${patternKey}|${industry ?? ""}`;
      let b = creativeBuckets.get(slotKey);
      if (!b) {
        b = {
          pattern_type: type,
          pattern_key: patternKey,
          pattern_label: label,
          ctrs: [],
          client_ids: new Set(),
          ad_count: 0,
          industry,
        };
        creativeBuckets.set(slotKey, b);
      }
      b.ctrs.push(ctr);
      if (ad.client_id != null) b.client_ids.add(ad.client_id);
      b.ad_count++;
    }

    const formatLabels: Record<string, string> = {
      talking_head: "Talking-head video",
      product_shot: "Product shot",
      ugc: "UGC-style",
      graphic: "Graphic / designed image",
      text_heavy: "Text-heavy image",
    };

    const hookLabels: Record<string, string> = {
      direct_offer: "Direct offer hook",
      curiosity: "Curiosity hook",
      problem_solution: "Problem-solution hook",
      testimonial: "Testimonial hook",
      how_to: "How-to hook",
      emotional: "Emotional hook",
    };

    for (const ad of adRows) {
      const ctr = ctrOf(ad);
      if (ctr == null) continue;

      // Look up the ad's industry once — used to add the ad to per-industry
      // buckets in addition to the cross-industry one. An ad with no client
      // industry contributes to cross-industry only.
      const adIndustry =
        ad.client_id != null ? industryByClient.get(ad.client_id) ?? null : null;

      if (ad.format_style) {
        const patternKey = `creative_format:${ad.format_style}`;
        const label = formatLabels[ad.format_style] ?? ad.format_style;
        addToBucket(patternKey, "creative_format", label, ad, ctr, null);
        if (adIndustry) {
          addToBucket(patternKey, "creative_format", label, ad, ctr, adIndustry);
        }
      }
      if (ad.hook_type) {
        const patternKey = `creative_hook:${ad.hook_type}`;
        const label = hookLabels[ad.hook_type] ?? ad.hook_type;
        addToBucket(patternKey, "creative_hook", label, ad, ctr, null);
        if (adIndustry) {
          addToBucket(patternKey, "creative_hook", label, ad, ctr, adIndustry);
        }
      }
    }

    const creativeRows: typeof rows = [];
    for (const b of creativeBuckets.values()) {
      if (b.ad_count < MIN_ADS_PER_BUCKET) continue;
      if (b.client_ids.size < MIN_UNIQUE_CLIENTS) continue;

      // Per-industry buckets compare against the industry's own mean —
      // hospitality CTR shouldn't be judged against e-commerce CTR. If for
      // any reason the industry baseline is missing (every ad in that
      // industry was filtered out by impression threshold), fall back to
      // the global baseline so we never silently divide by zero.
      const baseline =
        b.industry && industryMeanCtr.has(b.industry)
          ? industryMeanCtr.get(b.industry)!
          : globalMeanCtr;

      const meanCtr = b.ctrs.reduce((s, v) => s + v, 0) / b.ctrs.length;
      const liftPct =
        baseline > 0 ? ((meanCtr - baseline) / baseline) * 100 : 0;

      // Skip the unremarkable middle — only emit a finding when the
      // creative attribute moves the needle either way.
      if (Math.abs(liftPct) < MIN_LIFT_PCT) continue;

      const positive = liftPct > 0;
      // Bucket consistency = share of ads in the bucket that beat the
      // baseline they're being judged against (global or industry).
      // Different from "lift" — captures whether the win is broad or
      // driven by a couple of standouts.
      const aboveBaselineCount = b.ctrs.filter((v) => v > baseline).length;
      const consistency = Number(
        ((aboveBaselineCount / b.ctrs.length) * 100).toFixed(1)
      );

      const scope = b.industry
        ? `in ${formatIndustry(b.industry)}`
        : `across ${b.client_ids.size} clients`;
      const summary = positive
        ? `${b.pattern_label} outperforms the average by ${liftPct.toFixed(0)}% ${scope}`
        : `${b.pattern_label} underperforms the average by ${Math.abs(liftPct).toFixed(0)}% ${scope}`;

      // Per-industry rows get the industry name appended to the label so
      // the playbook page can render them without needing to look up the
      // industry separately for each card.
      const labelWithScope = b.industry
        ? `${b.pattern_label} · ${formatIndustry(b.industry)}`
        : b.pattern_label;

      creativeRows.push({
        pattern_type: b.pattern_type,
        pattern_key: b.pattern_key,
        pattern_label: labelWithScope,
        action_summary: summary,
        times_seen: b.ad_count,
        unique_clients: b.client_ids.size,
        positive_count: positive ? aboveBaselineCount : 0,
        neutral_count: 0,
        negative_count: positive ? 0 : b.ctrs.length - aboveBaselineCount,
        avg_ctr_lift: Number(liftPct.toFixed(2)),
        avg_cpc_change: null,
        avg_reliability: null,
        consistency_score: consistency,
        sample_learnings: [],
        top_tags: [],
        industry: b.industry,
        last_updated: new Date().toISOString(),
      });
    }

    rows.push(...creativeRows);

    // -----------------------------------------------------------------------
    // Backward validation. Before we wipe the table, snapshot the previous
    // run's consistency_score and unique_clients keyed by pattern_key, then
    // attach those as prev_* on the new rows. The UI uses the delta between
    // current and prev to flag "↓ slipping" patterns and the absence of a
    // prev row to flag "✨ new" patterns. Net effect: every refresh becomes
    // a check of yesterday's predictions against today's data, instead of
    // overwriting silently.
    // -----------------------------------------------------------------------
    const { data: priorRows } = await supabase
      .from("global_learnings")
      .select("pattern_key, industry, consistency_score, unique_clients");

    // Key on (pattern_key, industry) — same composite the new uniqueness
    // index uses. Without industry in the key, every per-industry row
    // would inherit the cross-industry baseline and the slipping-pattern
    // detector would generate phantom alarms.
    const priorByKey = new Map<
      string,
      { consistency_score: number | null; unique_clients: number | null }
    >();
    for (const r of (priorRows ?? []) as {
      pattern_key: string;
      industry: string | null;
      consistency_score: number | null;
      unique_clients: number | null;
    }[]) {
      priorByKey.set(`${r.pattern_key}|${r.industry ?? ""}`, {
        consistency_score: r.consistency_score,
        unique_clients: r.unique_clients,
      });
    }

    type EnrichedRow = (typeof rows)[number] & {
      prev_consistency_score: number | null;
      prev_unique_clients: number | null;
    };

    const enrichedRows: EnrichedRow[] = rows.map((r) => {
      const prior = priorByKey.get(`${r.pattern_key}|${r.industry ?? ""}`);
      return {
        ...r,
        prev_consistency_score: prior?.consistency_score ?? null,
        prev_unique_clients: prior?.unique_clients ?? null,
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

    if (enrichedRows.length > 0) {
      const { error: insertError } = await supabase
        .from("global_learnings")
        .insert(enrichedRows);
      if (insertError) {
        return NextResponse.json(
          { ok: false, error: `Insert failed: ${insertError.message}` },
          { status: 500 }
        );
      }
    }

    // Cheap validation summary in the response: how many patterns slipped,
    // held, or first appeared this run. Useful as both a smoke test and as
    // an answer to "did anything important change since last run".
    const SLIP_THRESHOLD = 10; // consistency points
    let slipping = 0;
    let firstSeen = 0;
    let holding = 0;
    for (const r of enrichedRows) {
      if (r.prev_consistency_score == null) {
        firstSeen++;
      } else if (
        Number(r.consistency_score) <
        Number(r.prev_consistency_score) - SLIP_THRESHOLD
      ) {
        slipping++;
      } else {
        holding++;
      }
    }

    return NextResponse.json({
      ok: true,
      generated: enrichedRows.length,
      source_learnings: learnings.length,
      window_days: GENERATOR_WINDOW_DAYS,
      window_start: windowStartIso,
      validation: { slipping, first_seen: firstSeen, holding },
      breakdown: enrichedRows.reduce(
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
