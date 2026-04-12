/**
 * Cross-pollination — bridge "what's working" → meta_execution_queue.
 *
 * The intelligence layer (global_learnings, action_learnings, the per-ad
 * trust scores) all knows things like "UGC video + curiosity hook is winning
 * across 3 hospitality clients at 4.2% avg CTR." Until now that intelligence
 * sat in tables waiting for an operator to read it and manually fan it out.
 *
 * This module closes the loop: walk every active client, find creative
 * patterns they're missing, identify the best donor ad from another client
 * that exemplifies the missing pattern, and seed a `duplicate_ad` queue row
 * pointing at the donor. The seeded row sits on the TARGET client's queue
 * with provenance in the reason text — when the operator approves and
 * executes, the executor copies the donor (paused) so the operator can
 * re-target it for the new client.
 *
 * Why this works given the single-ad-account constraint:
 *   All guestlist clients share one Meta ad account (META_AD_ACCOUNT_ID).
 *   So `POST /{adMetaId}/copies` lands the duplicate in the source ad's
 *   own adset within the same account, paused. The operator then re-aims
 *   it at the target client's audience/budget. Less seamless than a true
 *   cross-account copy, but it actually works today and produces a real
 *   Meta object the operator can repurpose.
 *
 * Discovery is intentionally conservative:
 *   - Donor ads must have meaningful spend (MIN_DONOR_IMPRESSIONS) so we
 *     don't crown a coin-flip winner.
 *   - A pattern needs to be validated by at least MIN_CLIENTS_PER_PATTERN
 *     independent clients with avg CTR above MIN_AVG_CTR — single-client
 *     "winners" are not patterns.
 *   - Industry preference: when a target client has an industry, only
 *     suggest donors from that industry (or agency-wide patterns when no
 *     industry-scoped winner exists).
 *   - Hard cap of MAX_SUGGESTIONS_PER_CLIENT per run so the queue doesn't
 *     get drowned by a single discovery sweep.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Tunables. Centralised so the operator can dial them via a one-line edit.
// ---------------------------------------------------------------------------

/** Donor ads need at least this many impressions to be trusted as winners. */
export const MIN_DONOR_IMPRESSIONS = 1000;

/** Pattern needs at least this many distinct clients to count as cross-validated. */
export const MIN_CLIENTS_PER_PATTERN = 2;

/** Pattern's average CTR (percent) must beat this to be worth duplicating. */
export const MIN_AVG_CTR = 1.5;

/** Cap suggestions per target client so a single sweep can't flood the queue. */
export const MAX_SUGGESTIONS_PER_CLIENT = 3;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AdRow = {
  id: number;
  client_id: number | null;
  name: string | null;
  meta_id: string | null;
  // ads.ctr is NOT a stored column — we compute it from clicks/impressions
  // below and stash it on the row so the rest of the pipeline can read
  // ad.ctr without changes.
  ctr: number | null;
  clicks: number | null;
  impressions: number | null;
  performance_score: number | null;
  performance_status: string | null;
  creative_type: string | null;
  hook_type: string | null;
  format_style: string | null;
};

type ClientRow = {
  id: number;
  name: string;
  industry: string | null;
};

type PatternKey = string; // "creative_type|hook_type|format_style"

type ComboStats = {
  patternKey: PatternKey;
  creative_type: string | null;
  hook_type: string | null;
  format_style: string | null;
  /** Set of client_ids that have at least one ad matching this combo. */
  clientIds: Set<number>;
  /** Ads matching the combo, sorted by ctr DESC. */
  ads: AdRow[];
  avgCtr: number;
  /** Industries represented by clients running this combo. */
  industries: Set<string>;
};

export type CrossClientSuggestion = {
  targetClientId: number;
  targetClientName: string;
  targetIndustry: string | null;
  donorAdId: number;
  donorAdMetaId: string;
  donorAdName: string | null;
  donorClientId: number;
  donorClientName: string;
  pattern: {
    creative_type: string | null;
    hook_type: string | null;
    format_style: string | null;
  };
  evidence: {
    clientCount: number;
    avgCtr: number;
    sampleSize: number;
    industryScoped: boolean;
  };
  /** Free-text reason that goes onto the queue row. */
  reason: string;
};

export type DiscoveryStats = {
  adsScanned: number;
  clientsScanned: number;
  combosFound: number;
  qualifyingCombos: number;
  suggestionsBeforeCap: number;
  suggestionsAfterCap: number;
  /**
   * Funnel breakdown so the operator (and me) can see WHICH filter is
   * killing rows when zero combos qualify. Each number is a count of ads
   * that survived up to that filter, in order.
   */
  funnel: {
    withMetaId: number;
    meetingImpressionFloor: number;
    withAnyCreativeAttr: number;
    eligibleDonors: number;
  };
  /**
   * Reasons combos failed the qualification gate, so it's obvious whether
   * the bottleneck is "single-client patterns" or "CTR too low".
   */
  rejected: {
    emptyPattern: number;
    tooFewClients: number;
    ctrBelowFloor: number;
  };
};

/**
 * Diagnostic preview of the strongest combos found, even if they didn't
 * qualify. Lets us see what the data actually looks like before tuning
 * thresholds. Returned alongside suggestions in DiscoveryResult.
 */
export type ComboDebug = {
  patternKey: PatternKey;
  creative_type: string | null;
  hook_type: string | null;
  format_style: string | null;
  clientCount: number;
  adCount: number;
  avgCtr: number;
  qualified: boolean;
};

export type DiscoveryResult = {
  suggestions: CrossClientSuggestion[];
  stats: DiscoveryStats;
  topCombos: ComboDebug[];
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build the pattern key. Null fields become "?" so combos with only one or
 * two attributes still group together. We deliberately keep nulls in the
 * key (rather than skipping them) so two ads with the same hook but
 * unknown format don't get bucketed against the same hook with a known
 * format — that would be a fake match.
 */
function patternKeyFor(ad: AdRow): PatternKey {
  return [
    ad.creative_type ?? "?",
    ad.hook_type ?? "?",
    ad.format_style ?? "?",
  ].join("|");
}

/** Skip combos that are entirely "?|?|?" — that's just "no metadata". */
function isEmptyPattern(combo: ComboStats): boolean {
  return (
    combo.creative_type == null &&
    combo.hook_type == null &&
    combo.format_style == null
  );
}

function describePattern(p: {
  creative_type: string | null;
  hook_type: string | null;
  format_style: string | null;
}): string {
  const parts: string[] = [];
  if (p.format_style) parts.push(p.format_style.replace(/_/g, " "));
  if (p.creative_type) parts.push(p.creative_type.toLowerCase());
  if (p.hook_type) parts.push(`${p.hook_type.replace(/_/g, " ")} hook`);
  return parts.length > 0 ? parts.join(" + ") : "this pattern";
}

// ---------------------------------------------------------------------------
// Main discovery
// ---------------------------------------------------------------------------

export async function discoverPatternMatches(
  supabase: SupabaseClient
): Promise<DiscoveryResult> {
  // Pull every ad with enough signal to potentially be a donor or to
  // mark a client as "already running this pattern." We pull broadly
  // and filter in JS so the grouping logic stays in one place.
  const { data: adRows, error: adErr } = await supabase
    .from("ads")
    .select(
      "id, client_id, name, meta_id, clicks, impressions, performance_score, performance_status, creative_type, hook_type, format_style"
    );
  if (adErr) {
    throw new Error(`discoverPatternMatches: ads query failed: ${adErr.message}`);
  }
  // CTR isn't a stored column. Compute it once here from clicks/impressions
  // so every downstream caller (combo grouping, donor ranking, evidence
  // text) can keep reading `ad.ctr` without per-call recomputation.
  const ads: AdRow[] = (adRows ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    const impressions = Number(r.impressions ?? 0);
    const clicks = Number(r.clicks ?? 0);
    const ctr =
      impressions > 0 ? Number(((clicks / impressions) * 100).toFixed(2)) : 0;
    return {
      id: Number(r.id),
      client_id: r.client_id == null ? null : Number(r.client_id),
      name: (r.name as string | null) ?? null,
      meta_id: (r.meta_id as string | null) ?? null,
      ctr,
      clicks,
      impressions,
      performance_score:
        r.performance_score == null ? null : Number(r.performance_score),
      performance_status: (r.performance_status as string | null) ?? null,
      creative_type: (r.creative_type as string | null) ?? null,
      hook_type: (r.hook_type as string | null) ?? null,
      format_style: (r.format_style as string | null) ?? null,
    };
  });

  const { data: clientRows, error: clientErr } = await supabase
    .from("clients")
    .select("id, name, industry");
  if (clientErr) {
    throw new Error(
      `discoverPatternMatches: clients query failed: ${clientErr.message}`
    );
  }
  const clients = (clientRows ?? []) as ClientRow[];
  const clientById = new Map<number, ClientRow>();
  for (const c of clients) clientById.set(Number(c.id), c);

  // Track which (clientId, patternKey) combinations already exist — this is
  // how we know a client is "already running" a pattern, so we don't suggest
  // they duplicate something they already have.
  const clientPatternsRun = new Map<number, Set<PatternKey>>();
  for (const ad of ads) {
    if (ad.client_id == null) continue;
    const key = patternKeyFor(ad);
    let set = clientPatternsRun.get(Number(ad.client_id));
    if (!set) {
      set = new Set();
      clientPatternsRun.set(Number(ad.client_id), set);
    }
    set.add(key);
  }

  // Group qualifying donor ads by pattern. A donor must:
  //   - Have a meta_id (otherwise the executor can't copy it)
  //   - Have at least MIN_DONOR_IMPRESSIONS so we trust the CTR
  //   - Not be a "winner of nothing" — at least some attribute populated
  let funnelWithMetaId = 0;
  let funnelMeetingImpressionFloor = 0;
  let funnelWithAnyCreativeAttr = 0;
  let funnelEligibleDonors = 0;

  const combos = new Map<PatternKey, ComboStats>();
  for (const ad of ads) {
    if (!ad.meta_id) continue;
    if (ad.client_id == null) continue;
    funnelWithMetaId++;
    const impressions = Number(ad.impressions ?? 0);
    if (impressions < MIN_DONOR_IMPRESSIONS) continue;
    funnelMeetingImpressionFloor++;
    if (
      ad.creative_type == null &&
      ad.hook_type == null &&
      ad.format_style == null
    ) {
      continue;
    }
    funnelWithAnyCreativeAttr++;
    funnelEligibleDonors++;
    const key = patternKeyFor(ad);
    let combo = combos.get(key);
    if (!combo) {
      combo = {
        patternKey: key,
        creative_type: ad.creative_type,
        hook_type: ad.hook_type,
        format_style: ad.format_style,
        clientIds: new Set(),
        ads: [],
        avgCtr: 0,
        industries: new Set(),
      };
      combos.set(key, combo);
    }
    combo.clientIds.add(Number(ad.client_id));
    combo.ads.push(ad);
    const client = clientById.get(Number(ad.client_id));
    if (client?.industry) combo.industries.add(client.industry);
  }

  // Compute stats and rank ads by ctr per combo.
  for (const combo of combos.values()) {
    const ctrs = combo.ads
      .map((a) => Number(a.ctr ?? 0))
      .filter((v) => Number.isFinite(v) && v > 0);
    combo.avgCtr =
      ctrs.length > 0
        ? Number((ctrs.reduce((s, v) => s + v, 0) / ctrs.length).toFixed(2))
        : 0;
    combo.ads.sort((a, b) => Number(b.ctr ?? 0) - Number(a.ctr ?? 0));
  }

  // Filter to qualifying patterns: enough cross-client validation AND
  // average CTR above the floor.
  let rejectedEmptyPattern = 0;
  let rejectedTooFewClients = 0;
  let rejectedCtrBelowFloor = 0;
  const qualifying: ComboStats[] = [];
  for (const combo of combos.values()) {
    if (isEmptyPattern(combo)) {
      rejectedEmptyPattern++;
      continue;
    }
    if (combo.clientIds.size < MIN_CLIENTS_PER_PATTERN) {
      rejectedTooFewClients++;
      continue;
    }
    if (combo.avgCtr < MIN_AVG_CTR) {
      rejectedCtrBelowFloor++;
      continue;
    }
    qualifying.push(combo);
  }
  // Strongest patterns first — by ctr, then by client count.
  qualifying.sort((a, b) => {
    if (b.avgCtr !== a.avgCtr) return b.avgCtr - a.avgCtr;
    return b.clientIds.size - a.clientIds.size;
  });

  // For each qualifying combo, walk clients and propose duplicates for
  // every client NOT already running it. Industry preference applies:
  // when the target client has an industry, only suggest donors that
  // include that industry in the combo. (When the combo has no industry
  // metadata at all — because none of the donors had an industry tag —
  // it falls through as agency-wide and applies to anyone.)
  const rawSuggestions: CrossClientSuggestion[] = [];
  for (const combo of qualifying) {
    const comboHasIndustry = combo.industries.size > 0;
    for (const client of clients) {
      const targetId = Number(client.id);
      const alreadyRun = clientPatternsRun.get(targetId);
      if (alreadyRun?.has(combo.patternKey)) continue;
      // Industry gate
      let industryScoped = false;
      if (client.industry && comboHasIndustry) {
        if (!combo.industries.has(client.industry)) continue;
        industryScoped = true;
      } else if (!client.industry && comboHasIndustry) {
        // Target has no industry — only suggest agency-wide combos. Skip
        // industry-only combos to avoid noise.
        continue;
      }

      // Pick the best donor ad from a DIFFERENT client. The combo's ads
      // are ctr-sorted, so the first one matching is the strongest.
      const donor = combo.ads.find((a) => Number(a.client_id) !== targetId);
      if (!donor || !donor.meta_id) continue;
      const donorClient = clientById.get(Number(donor.client_id));
      if (!donorClient) continue;

      const pattern = {
        creative_type: combo.creative_type,
        hook_type: combo.hook_type,
        format_style: combo.format_style,
      };
      const description = describePattern(pattern);
      const scopeText = industryScoped
        ? `${combo.clientIds.size} ${client.industry} clients`
        : `${combo.clientIds.size} clients`;
      const reason = `Cross-client pattern: ${description} averages ${combo.avgCtr.toFixed(2)}% CTR across ${scopeText} (${combo.ads.length} ads). ${client.name} has not yet tested this combination — duplicate "${donor.name ?? "donor ad"}" from ${donorClient.name} (paused, for review).`;

      rawSuggestions.push({
        targetClientId: targetId,
        targetClientName: client.name,
        targetIndustry: client.industry,
        donorAdId: Number(donor.id),
        donorAdMetaId: String(donor.meta_id),
        donorAdName: donor.name,
        donorClientId: Number(donor.client_id),
        donorClientName: donorClient.name,
        pattern,
        evidence: {
          clientCount: combo.clientIds.size,
          avgCtr: combo.avgCtr,
          sampleSize: combo.ads.length,
          industryScoped,
        },
        reason,
      });
    }
  }

  // Cap per-target-client. The combos list is already sorted strongest
  // first, so the cap keeps the highest-quality suggestions.
  const perClientCount = new Map<number, number>();
  const capped: CrossClientSuggestion[] = [];
  for (const s of rawSuggestions) {
    const seen = perClientCount.get(s.targetClientId) ?? 0;
    if (seen >= MAX_SUGGESTIONS_PER_CLIENT) continue;
    perClientCount.set(s.targetClientId, seen + 1);
    capped.push(s);
  }

  // Diagnostic top combos: strongest combos by ctr * client count, with a
  // qualified flag so the operator can see whether tuning a threshold by 1
  // notch would unlock anything.
  const topCombos: ComboDebug[] = Array.from(combos.values())
    .filter((c) => !isEmptyPattern(c))
    .sort((a, b) => {
      // Rank by client count first (cross-client patterns matter most),
      // then by ctr.
      if (b.clientIds.size !== a.clientIds.size) {
        return b.clientIds.size - a.clientIds.size;
      }
      return b.avgCtr - a.avgCtr;
    })
    .slice(0, 10)
    .map((c) => ({
      patternKey: c.patternKey,
      creative_type: c.creative_type,
      hook_type: c.hook_type,
      format_style: c.format_style,
      clientCount: c.clientIds.size,
      adCount: c.ads.length,
      avgCtr: c.avgCtr,
      qualified:
        c.clientIds.size >= MIN_CLIENTS_PER_PATTERN &&
        c.avgCtr >= MIN_AVG_CTR,
    }));

  return {
    suggestions: capped,
    stats: {
      adsScanned: ads.length,
      clientsScanned: clients.length,
      combosFound: combos.size,
      qualifyingCombos: qualifying.length,
      suggestionsBeforeCap: rawSuggestions.length,
      suggestionsAfterCap: capped.length,
      funnel: {
        withMetaId: funnelWithMetaId,
        meetingImpressionFloor: funnelMeetingImpressionFloor,
        withAnyCreativeAttr: funnelWithAnyCreativeAttr,
        eligibleDonors: funnelEligibleDonors,
      },
      rejected: {
        emptyPattern: rejectedEmptyPattern,
        tooFewClients: rejectedTooFewClients,
        ctrBelowFloor: rejectedCtrBelowFloor,
      },
    },
    topCombos,
  };
}

// ---------------------------------------------------------------------------
// Seeder. Cannot reuse seedDuplicateAd from lib/meta-queue-seed because that
// dedupes purely by source ad_meta_id, which would prevent two different
// target clients from each queueing a copy of the same donor. Cross-pollinate
// dedupe is by (target client_id, donor ad_meta_id).
// ---------------------------------------------------------------------------

export type SeedCrossClientResult =
  | { ok: true; queueId: number; deduped: boolean }
  | { ok: false; error: string };

export async function seedCrossClientDuplicate(
  supabase: SupabaseClient,
  suggestion: CrossClientSuggestion
): Promise<SeedCrossClientResult> {
  // Dedupe scoped to (target client, donor ad). Without the client_id
  // filter we'd reject the second target's queue row whenever two clients
  // both want the same donor — wrong intent.
  const { data: existing, error: existingErr } = await supabase
    .from("meta_execution_queue")
    .select("id")
    .eq("decision_type", "duplicate_ad")
    .eq("ad_meta_id", suggestion.donorAdMetaId)
    .eq("client_id", suggestion.targetClientId)
    .in("status", ["pending", "approved"])
    .limit(1);

  if (existingErr) {
    // Treat dedupe-check failures as "no existing row" so the worst case
    // is a duplicate queue entry, not silent data loss.
    console.error(
      "seedCrossClientDuplicate dedupe check failed:",
      existingErr
    );
  } else if (existing && existing.length > 0) {
    return { ok: true, queueId: Number(existing[0].id), deduped: true };
  }

  const { data, error } = await supabase
    .from("meta_execution_queue")
    .insert({
      client_id: suggestion.targetClientId,
      // The ad_id column points at our local ads.id for the donor — the
      // queue page uses it to render a thumbnail / link.
      ad_id: suggestion.donorAdId,
      ad_meta_id: suggestion.donorAdMetaId,
      decision_type: "duplicate_ad",
      proposed_payload: {
        new_name_suffix: ` [pattern-match for ${suggestion.targetClientName}]`,
        cross_client_provenance: {
          target_client_id: suggestion.targetClientId,
          target_client_name: suggestion.targetClientName,
          donor_client_id: suggestion.donorClientId,
          donor_client_name: suggestion.donorClientName,
          pattern: suggestion.pattern,
          evidence: suggestion.evidence,
        },
      },
      reason: suggestion.reason,
      // Risk: medium — duplicate-to-paused is reversible but the operator
      // still has to retarget the copy, so we don't claim it's low-risk.
      risk_level: "medium",
      status: "pending",
    })
    .select("id")
    .single();

  if (error || !data) {
    return { ok: false, error: error?.message ?? "insert returned no row" };
  }
  return { ok: true, queueId: Number(data.id), deduped: false };
}
