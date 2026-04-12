/**
 * Meta (Facebook) Ads API integration layer.
 *
 * All Meta Graph API calls live here. The rest of the app imports
 * from this single file — keeps the external dependency isolated.
 *
 * Env vars required:
 *   META_ACCESS_TOKEN   — long-lived user or system token
 *   META_AD_ACCOUNT_ID  — e.g. "act_123456789"
 */

const API_VERSION = "v25.0";
const BASE_URL = `https://graph.facebook.com/${API_VERSION}`;

function getCredentials() {
  const token = process.env.META_ACCESS_TOKEN;
  const accountId = process.env.META_AD_ACCOUNT_ID;

  if (!token || !accountId) {
    throw new Error(
      "Missing META_ACCESS_TOKEN or META_AD_ACCOUNT_ID environment variables."
    );
  }

  return { token, accountId };
}

/** Single page fetch from Meta Graph API. */
async function metaFetch<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const { token } = getCredentials();

  const url = new URL(`${BASE_URL}${path}`);
  url.searchParams.set("access_token", token);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const res = await fetch(url.toString(), { cache: "no-store" });
  const data = await res.json();

  if (data.error) {
    console.error("Meta API error:", data.error);
    throw new Error(data.error.message ?? "Meta API request failed.");
  }

  return data as T;
}

/** Paginated fetch — follows `paging.next` until all pages are consumed. */
async function metaFetchAll<T>(path: string, params: Record<string, string> = {}): Promise<T[]> {
  const { token } = getCredentials();

  const url = new URL(`${BASE_URL}${path}`);
  url.searchParams.set("access_token", token);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const all: T[] = [];
  let nextUrl: string | null = url.toString();

  while (nextUrl) {
    const response = await fetch(nextUrl, { cache: "no-store" });
    const data: { data?: T[]; paging?: { next?: string }; error?: { message?: string } } = await response.json();

    if (data.error) {
      console.error("Meta API pagination error:", data.error);
      throw new Error(data.error.message ?? "Meta API request failed.");
    }

    if (data.data) {
      all.push(...data.data);
    }

    nextUrl = data.paging?.next ?? null;
  }

  return all;
}

// ---------------------------------------------------------------------------
// Types — what Meta returns
// ---------------------------------------------------------------------------

export type MetaAdAccount = {
  id: string;
  name: string;
  currency: string;
  timezone_name: string;
  account_status: number;
};

export type MetaCampaign = {
  id: string;
  name: string;
  status: string;
  objective: string;
  daily_budget?: string;
  lifetime_budget?: string;
  start_time?: string;
  stop_time?: string;
  created_time?: string;
  updated_time?: string;
};

export type MetaAdSet = {
  id: string;
  name: string;
  status: string;
  campaign_id: string;
  daily_budget?: string;
  lifetime_budget?: string;
  targeting?: {
    age_min?: number;
    age_max?: number;
    genders?: number[];
    geo_locations?: { countries?: string[] };
    interests?: { id: string; name: string }[];
  };
  start_time?: string;
  end_time?: string;
};

export type MetaAd = {
  id: string;
  name: string;
  status: string;
  effective_status?: string;
  configured_status?: string;
  adset_id: string;
  campaign_id: string;
  created_time?: string;
  updated_time?: string;
  creative?: {
    id: string;
    name?: string;
    body?: string;
    title?: string;
    image_url?: string;
    thumbnail_url?: string;
    video_id?: string;
    object_type?: string;
    call_to_action_type?: string;
    link_url?: string;
    effective_object_story_id?: string;
    instagram_permalink_url?: string;
    object_story_spec?: Record<string, unknown>;
    asset_feed_spec?: Record<string, unknown>;
  };
};

type MetaAction = { action_type: string; value: string };
type MetaVideoAction = { action_type?: string; value: string };

export type MetaInsight = {
  campaign_id?: string;
  campaign_name?: string;
  adset_id?: string;
  adset_name?: string;
  ad_id?: string;
  ad_name?: string;

  // Core
  impressions: string;
  clicks: string;
  spend: string;
  ctr: string;
  cpc?: string;
  cpm?: string;
  cpp?: string;

  // Delivery quality
  reach?: string;
  frequency?: string;
  unique_clicks?: string;
  unique_ctr?: string;
  unique_inline_link_clicks?: string;

  // Funnel
  inline_link_clicks?: string;
  outbound_clicks?: MetaAction[];
  website_ctr?: MetaAction[];
  cost_per_inline_link_click?: string;
  cost_per_outbound_click?: MetaAction[];

  // Actions
  actions?: MetaAction[];
  cost_per_action_type?: MetaAction[];
  conversions?: MetaAction[];
  cost_per_conversion?: MetaAction[];

  // Video
  video_play_actions?: MetaVideoAction[];
  video_p25_watched_actions?: MetaVideoAction[];
  video_p50_watched_actions?: MetaVideoAction[];
  video_p75_watched_actions?: MetaVideoAction[];
  video_p100_watched_actions?: MetaVideoAction[];
  video_avg_time_watched_actions?: MetaVideoAction[];
  video_thruplay_watched_actions?: MetaVideoAction[];

  // Meta rankings
  quality_ranking?: string;
  engagement_rate_ranking?: string;
  conversion_rate_ranking?: string;

  date_start: string;
  date_stop: string;
};

export type MetaBreakdownInsight = MetaInsight & {
  publisher_platform?: string;
  platform_position?: string;
  device_platform?: string;
  age?: string;
  gender?: string;
};

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

/** Verify credentials — returns ad account info. */
export async function getAdAccount(): Promise<MetaAdAccount> {
  const { accountId } = getCredentials();
  return metaFetch<MetaAdAccount>(`/${accountId}`, {
    fields: "id,name,currency,timezone_name,account_status",
  });
}

/** Fetch all campaigns (paginated). Optionally filter by effective_status. */
export async function getCampaigns(
  statuses?: string[]
): Promise<MetaCampaign[]> {
  const { accountId } = getCredentials();
  const params: Record<string, string> = {
    fields:
      "id,name,status,objective,daily_budget,lifetime_budget,start_time,stop_time,created_time,updated_time",
    limit: "200",
  };
  if (statuses) {
    params.effective_status = JSON.stringify(statuses);
  }
  return metaFetchAll<MetaCampaign>(`/${accountId}/campaigns`, params);
}

/** Fetch all ad sets (paginated). */
export async function getAdSets(): Promise<MetaAdSet[]> {
  const { accountId } = getCredentials();
  return metaFetchAll<MetaAdSet>(`/${accountId}/adsets`, {
    fields:
      "id,name,status,campaign_id,daily_budget,lifetime_budget,targeting,start_time,end_time",
    limit: "200",
  });
}

/** Fetch all ads (paginated). */
export async function getAds(): Promise<MetaAd[]> {
  const { accountId } = getCredentials();
  return metaFetchAll<MetaAd>(`/${accountId}/ads`, {
    // Note `video_id` in the creative subselect — Meta doesn't expose a
    // direct video URL on creatives, only the video object id. We resolve
    // the playable URL via a separate /{video_id}?fields=source call in
    // resolveVideoSource() below.
    fields:
      "id,name,status,effective_status,configured_status,adset_id,campaign_id,created_time,updated_time," +
      "creative{id,name,body,title,image_url,thumbnail_url,video_id,object_type,call_to_action_type," +
      "link_url,effective_object_story_id,instagram_permalink_url,object_story_spec,asset_feed_spec}",
    limit: "200",
  });
}

/**
 * Resolve a Meta video_id into a playable source URL via the Graph API.
 *
 * The `creative.video_id` we get from /ads is just an opaque id — there's
 * no direct URL on the creative object. This call hits /{video_id}?fields=source
 * which returns the playable mp4 URL Meta hosts.
 *
 * Returns null on any failure (missing source, deleted video, permission
 * error) — we never want a single bad video to break the whole sync, and
 * the column is nullable.
 */
export async function resolveVideoSource(videoId: string): Promise<string | null> {
  try {
    const data = await metaFetch<{ source?: string; id?: string }>(
      `/${videoId}`,
      { fields: "source" }
    );
    return data.source ?? null;
  } catch (err) {
    console.warn(`[meta] resolveVideoSource(${videoId}) failed:`, err);
    return null;
  }
}

/**
 * Resolve a Meta video_id into its auto-generated poster image URL.
 *
 * Used as the last-ditch fallback for `creative_image_url` when the
 * extractor's normal field chain (image_url → thumbnail_url → spec.*)
 * comes back empty — which is the common case for video ads built
 * without an explicit image override. Meta always exposes a `picture`
 * field on the video object itself, even when nothing else surfaces a
 * thumbnail, so this gives every video creative *something* to render
 * instead of "No preview".
 *
 * Returns null on any failure — same contract as resolveVideoSource;
 * a single bad video must never break the whole sync.
 */
export async function resolveVideoPoster(videoId: string): Promise<string | null> {
  try {
    const data = await metaFetch<{ picture?: string; id?: string }>(
      `/${videoId}`,
      { fields: "picture" }
    );
    return data.picture ?? null;
  } catch (err) {
    console.warn(`[meta] resolveVideoPoster(${videoId}) failed:`, err);
    return null;
  }
}

/**
 * Resolve an `effective_object_story_id` (the underlying FB/IG post id)
 * into its full-size image. Many Instagram-only ads carry no creative
 * image URL on the ad creative itself — the image lives on the source
 * post — so we have to walk to the post to render anything at all.
 *
 * Object story ids look like `{page_id}_{post_id}`. The `full_picture`
 * field is the canonical first-frame thumbnail Meta serves for the post.
 *
 * Returns null on any failure.
 */
export async function resolveObjectStoryImage(
  objectStoryId: string
): Promise<string | null> {
  try {
    const data = await metaFetch<{ full_picture?: string; picture?: string }>(
      `/${objectStoryId}`,
      { fields: "full_picture,picture" }
    );
    return data.full_picture ?? data.picture ?? null;
  } catch (err) {
    console.warn(
      `[meta] resolveObjectStoryImage(${objectStoryId}) failed:`,
      err
    );
    return null;
  }
}

// Shared field set for ad-level insights. Kept in one place so it's easy
// to tweak without drifting between aggregate and breakdown calls.
const AD_INSIGHT_FIELDS = [
  "campaign_id",
  "campaign_name",
  "adset_id",
  "adset_name",
  "ad_id",
  "ad_name",
  // Core
  "impressions",
  "clicks",
  "spend",
  "ctr",
  "cpc",
  "cpm",
  "cpp",
  // Delivery quality
  "reach",
  "frequency",
  "unique_clicks",
  "unique_ctr",
  "unique_inline_link_clicks",
  // Funnel
  "inline_link_clicks",
  "outbound_clicks",
  "website_ctr",
  "cost_per_inline_link_click",
  "cost_per_outbound_click",
  // Actions
  "actions",
  "cost_per_action_type",
  "conversions",
  "cost_per_conversion",
  // Video
  "video_play_actions",
  "video_p25_watched_actions",
  "video_p50_watched_actions",
  "video_p75_watched_actions",
  "video_p100_watched_actions",
  "video_avg_time_watched_actions",
  "video_thruplay_watched_actions",
  // Meta rankings
  "quality_ranking",
  "engagement_rate_ranking",
  "conversion_rate_ranking",
].join(",");

/**
 * Fetch ad-level insights for a custom date range.
 * Defaults to last 12 months. Aggregates the full period per ad.
 */
export async function getAdInsights(opts?: {
  since?: string;
  until?: string;
  datePreset?: string;
}): Promise<MetaInsight[]> {
  const { accountId } = getCredentials();
  const params: Record<string, string> = {
    fields: AD_INSIGHT_FIELDS,
    level: "ad",
    limit: "500",
    use_unified_attribution_setting: "true",
    action_attribution_windows: JSON.stringify(["7d_click", "1d_view"]),
  };

  if (opts?.since && opts?.until) {
    params.time_range = JSON.stringify({
      since: opts.since,
      until: opts.until,
    });
  } else {
    params.date_preset = opts?.datePreset ?? "last_year";
  }

  return metaFetchAll<MetaInsight>(`/${accountId}/insights`, params);
}

/**
 * Fetch ad-level insights broken down by placement (publisher platform ×
 * position × device). One row per ad × bucket.
 */
export async function getAdPlacementInsights(opts?: {
  since?: string;
  until?: string;
  datePreset?: string;
}): Promise<MetaBreakdownInsight[]> {
  const { accountId } = getCredentials();
  const params: Record<string, string> = {
    fields:
      "ad_id,ad_name,impressions,clicks,spend,ctr,cpm,actions,cost_per_action_type",
    level: "ad",
    limit: "500",
    breakdowns: "publisher_platform,platform_position,device_platform",
  };
  if (opts?.since && opts?.until) {
    params.time_range = JSON.stringify({ since: opts.since, until: opts.until });
  } else {
    params.date_preset = opts?.datePreset ?? "last_30d";
  }
  return metaFetchAll<MetaBreakdownInsight>(`/${accountId}/insights`, params);
}

/**
 * Fetch ad-level insights broken down by age × gender.
 */
export async function getAdDemographicInsights(opts?: {
  since?: string;
  until?: string;
  datePreset?: string;
}): Promise<MetaBreakdownInsight[]> {
  const { accountId } = getCredentials();
  const params: Record<string, string> = {
    fields: "ad_id,ad_name,impressions,clicks,spend,ctr,actions",
    level: "ad",
    limit: "500",
    breakdowns: "age,gender",
  };
  if (opts?.since && opts?.until) {
    params.time_range = JSON.stringify({ since: opts.since, until: opts.until });
  } else {
    params.date_preset = opts?.datePreset ?? "last_30d";
  }
  return metaFetchAll<MetaBreakdownInsight>(`/${accountId}/insights`, params);
}

/**
 * Fetch campaign-level insights for a custom date range.
 */
export async function getCampaignInsights(opts?: {
  since?: string;
  until?: string;
  datePreset?: string;
}): Promise<MetaInsight[]> {
  const { accountId } = getCredentials();
  const params: Record<string, string> = {
    fields:
      "campaign_id,campaign_name,impressions,clicks,spend,ctr,cpc,cpm,cpp,reach,frequency," +
      "unique_clicks,unique_ctr,inline_link_clicks,outbound_clicks,website_ctr," +
      "actions,cost_per_action_type,conversions,cost_per_conversion," +
      "quality_ranking,engagement_rate_ranking,conversion_rate_ranking",
    level: "campaign",
    limit: "200",
    use_unified_attribution_setting: "true",
    action_attribution_windows: JSON.stringify(["7d_click", "1d_view"]),
  };

  if (opts?.since && opts?.until) {
    params.time_range = JSON.stringify({
      since: opts.since,
      until: opts.until,
    });
  } else {
    params.date_preset = opts?.datePreset ?? "last_year";
  }

  return metaFetchAll<MetaInsight>(`/${accountId}/insights`, params);
}

/**
 * Fetch daily ad-level insights (one row per ad per day) for trend tracking.
 */
export async function getDailyAdInsights(opts?: {
  since?: string;
  until?: string;
  datePreset?: string;
}): Promise<MetaInsight[]> {
  const { accountId } = getCredentials();
  const params: Record<string, string> = {
    fields:
      "campaign_id,ad_id,ad_name,impressions,clicks,spend,ctr,actions",
    level: "ad",
    time_increment: "1", // daily breakdown
    limit: "500",
  };

  if (opts?.since && opts?.until) {
    params.time_range = JSON.stringify({
      since: opts.since,
      until: opts.until,
    });
  } else {
    params.date_preset = opts?.datePreset ?? "last_30d";
  }

  return metaFetchAll<MetaInsight>(`/${accountId}/insights`, params);
}

// ---------------------------------------------------------------------------
// Mapping helpers — Meta data → your DB shape
// ---------------------------------------------------------------------------

/** Map Meta campaign/ad status to your DB status. */
export function mapMetaStatus(
  metaStatus: string
): "winner" | "testing" | "losing" | "paused" {
  switch (metaStatus) {
    case "ACTIVE":
      return "winner";
    case "PAUSED":
      return "paused";
    case "DELETED":
    case "ARCHIVED":
      return "losing";
    default:
      return "testing";
  }
}

/** Map Meta objective string to a clean label. */
export function mapMetaObjective(objective: string): string {
  const map: Record<string, string> = {
    OUTCOME_ENGAGEMENT: "engagement",
    OUTCOME_TRAFFIC: "traffic",
    OUTCOME_AWARENESS: "awareness",
    OUTCOME_LEADS: "leads",
    OUTCOME_SALES: "conversions",
    OUTCOME_APP_PROMOTION: "app promotion",
    LINK_CLICKS: "traffic",
    POST_ENGAGEMENT: "engagement",
    BRAND_AWARENESS: "awareness",
    REACH: "awareness",
    CONVERSIONS: "conversions",
    LEAD_GENERATION: "leads",
    MESSAGES: "engagement",
    VIDEO_VIEWS: "engagement",
    PAGE_LIKES: "engagement",
  };
  return map[objective] ?? objective?.toLowerCase().replace(/_/g, " ") ?? "unknown";
}

// Small helpers for the action-shaped arrays Meta returns.
function sumAction(
  arr: { action_type?: string; value: string }[] | undefined,
  type?: string
): number {
  if (!arr) return 0;
  return arr.reduce((sum, a) => {
    if (type && a.action_type !== type) return sum;
    return sum + Number(a.value ?? 0);
  }, 0);
}

function firstActionValue(
  arr: { action_type?: string; value: string }[] | undefined
): number {
  if (!arr || arr.length === 0) return 0;
  return Number(arr[0].value ?? 0);
}

function actionsByType(
  arr: { action_type: string; value: string }[] | undefined,
  types: string[]
): number {
  if (!arr) return 0;
  const set = new Set(types);
  return arr
    .filter((a) => set.has(a.action_type))
    .reduce((sum, a) => sum + Number(a.value ?? 0), 0);
}

/** Convert a Meta insight row into the shape your ads table expects. */
export function insightToAdRow(insight: MetaInsight) {
  const spend = Number(insight.spend ?? 0);
  const impressions = Number(insight.impressions ?? 0);
  const clicks = Number(insight.clicks ?? 0);
  const costPerResult =
    clicks > 0 && spend > 0 ? Number((spend / clicks).toFixed(4)) : 0;

  const actions = insight.actions ?? [];

  // Broad conversions bucket (legacy column — keep for backwards compat)
  const conversions = actionsByType(actions, [
    "offsite_conversion",
    "lead",
    "purchase",
    "complete_registration",
    "omni_purchase",
  ]);

  // Engagement (likes, comments, shares, reactions)
  const engagement = actionsByType(actions, [
    "post_engagement",
    "page_engagement",
    "post_reaction",
    "comment",
    "like",
  ]);

  // Split conversion types — Meta uses a few prefixes for the same event.
  // Match any of them so we don't under-count when the pixel/capi overlaps.
  const purchases = actionsByType(actions, [
    "purchase",
    "omni_purchase",
    "offsite_conversion.fb_pixel_purchase",
  ]);
  const leads = actionsByType(actions, [
    "lead",
    "onsite_conversion.lead_grouped",
    "offsite_conversion.fb_pixel_lead",
  ]);
  const addToCart = actionsByType(actions, [
    "add_to_cart",
    "offsite_conversion.fb_pixel_add_to_cart",
  ]);
  const initiateCheckout = actionsByType(actions, [
    "initiate_checkout",
    "offsite_conversion.fb_pixel_initiate_checkout",
  ]);
  const completeRegistration = actionsByType(actions, [
    "complete_registration",
    "offsite_conversion.fb_pixel_complete_registration",
  ]);
  const viewContent = actionsByType(actions, [
    "view_content",
    "offsite_conversion.fb_pixel_view_content",
  ]);
  const landingPageViews = actionsByType(actions, ["landing_page_view"]);

  return {
    name: insight.ad_name ?? "Meta ad",

    // Legacy/core
    spend,
    impressions,
    clicks,
    cost_per_result: costPerResult,
    conversions,
    engagement,
    followers_gained: 0,

    // Delivery quality
    reach: Number(insight.reach ?? 0),
    frequency: insight.frequency ? Number(insight.frequency) : null,
    cpm: insight.cpm ? Number(insight.cpm) : null,
    cpp: insight.cpp ? Number(insight.cpp) : null,
    unique_clicks: insight.unique_clicks ? Number(insight.unique_clicks) : null,
    unique_ctr: insight.unique_ctr ? Number(insight.unique_ctr) : null,

    // Funnel
    inline_link_clicks: insight.inline_link_clicks
      ? Number(insight.inline_link_clicks)
      : null,
    outbound_clicks: insight.outbound_clicks
      ? sumAction(insight.outbound_clicks)
      : null,
    landing_page_views: landingPageViews || null,

    // Split conversions
    purchases: purchases || null,
    leads: leads || null,
    add_to_cart: addToCart || null,
    initiate_checkout: initiateCheckout || null,
    complete_registration: completeRegistration || null,
    view_content: viewContent || null,
    actions_raw: actions.length > 0 ? actions : null,
    cost_per_action_raw:
      insight.cost_per_action_type && insight.cost_per_action_type.length > 0
        ? insight.cost_per_action_type
        : null,

    // Video
    video_plays: sumAction(insight.video_play_actions) || null,
    video_thruplays: sumAction(insight.video_thruplay_watched_actions) || null,
    video_avg_watch_seconds: firstActionValue(
      insight.video_avg_time_watched_actions
    ) || null,
    video_p25: sumAction(insight.video_p25_watched_actions) || null,
    video_p50: sumAction(insight.video_p50_watched_actions) || null,
    video_p75: sumAction(insight.video_p75_watched_actions) || null,
    video_p100: sumAction(insight.video_p100_watched_actions) || null,

    // Meta rankings
    quality_ranking: insight.quality_ranking ?? null,
    engagement_rate_ranking: insight.engagement_rate_ranking ?? null,
    conversion_rate_ranking: insight.conversion_rate_ranking ?? null,
  };
}

// ---------------------------------------------------------------------------
// Classifiers — heuristic, rule-based labels for the creative trust layer.
//
// These are deliberately simple, conservative, and inspectable. They run on
// every sync and write into hook_type / format_style on the ads table. The
// engine then aggregates by these labels to surface things like "how-to
// hooks beat direct-offer hooks by 28% CTR" without anyone hand-tagging
// creatives.
//
// Both functions return null when no rule fires confidently — we'd rather
// have a sparse, honest classification than a noisy one.
//
// v1 is text-only (body + headline). A future v2 should pipe the
// creative_image_url through a vision model to confirm format_style on
// videos and detect text-heavy graphics from the actual pixels.
// ---------------------------------------------------------------------------

export type HookType =
  | "direct_offer"
  | "curiosity"
  | "problem_solution"
  | "testimonial"
  | "how_to"
  | "emotional";

export type FormatStyle =
  | "talking_head"
  | "product_shot"
  | "ugc"
  | "graphic"
  | "text_heavy";

export function classifyHookType(
  body: string | null,
  headline: string | null
): HookType | null {
  const text = [headline, body].filter(Boolean).join(" ").toLowerCase().trim();
  if (!text) return null;

  // Order matters — earlier rules win when multiple match. We rank from
  // most-specific to least so a "how to save 50%" lands as how_to, not
  // direct_offer.
  if (/^how (to|i|we)\b|\b(step[- ]by[- ]step|tutorial|guide)\b/.test(text)) {
    return "how_to";
  }
  if (/(^|["'\s])(i used to|i tried|here['']?s how i|my (story|journey)|★|⭐|5[- ]?star)/.test(text)) {
    return "testimonial";
  }
  if (/\b(tired of|stop|no more|stuck|struggling|frustrated|sick of|fed up)\b/.test(text)) {
    return "problem_solution";
  }
  if (/(\$\d|\d+%\s*off|\bsave\b|\bfree\b|\bbuy now\b|\bshop now\b|\blimited (time|offer)\b|\bdeal\b|\bsale\b)/.test(text)) {
    return "direct_offer";
  }
  if (/\?|\b(the secret|you won['']?t believe|the truth about|here['']?s why|what (if|nobody))\b/.test(text)) {
    return "curiosity";
  }
  if (/\b(love|feel|transform|life[- ]chang|amazing|change your|finally|imagine|dream)\b/.test(text)) {
    return "emotional";
  }

  return null;
}

export function classifyFormatStyle(
  creativeType: string | null,
  body: string | null,
  headline: string | null
): FormatStyle | null {
  const text = [headline, body].filter(Boolean).join(" ").toLowerCase();
  const longCopy = (body?.length ?? 0) > 220;
  const ct = (creativeType ?? "").toUpperCase();

  // UGC reads pretty reliably from copy markers, regardless of media type.
  if (/\b(real (people|story)|honest review|i tried|i used|authentic|unfiltered|caught on camera|ugc)\b/.test(text)) {
    return "ugc";
  }

  // Video paths — talking head is the default when copy is first-person
  // and lacks UGC markers; otherwise we don't guess.
  if (ct === "VIDEO") {
    if (/\b(i['']?m|we['']?re|here['']?s|let me show|in this video)\b/.test(text)) {
      return "talking_head";
    }
    return null;
  }

  // Static images with very long body copy are usually graphic-with-text
  // overlays; short body copy with a product-led headline is a product shot.
  if (ct === "IMAGE" || ct === "PHOTO") {
    if (longCopy) return "text_heavy";
    if (/\b(buy|shop|new|now available|in stock|delivery|priced)\b/.test(text)) {
      return "product_shot";
    }
    return "graphic";
  }

  // Carousel and dynamic creatives don't fit a single format_style cleanly.
  return null;
}

// ---------------------------------------------------------------------------
// creativeToAdRow — extracts the human-readable creative fields plus the
// structured/classified bits the engine reads. The extraction follows the
// shape Meta returns: object_story_spec.link_data carries the canonical
// link-ad copy, falling back to the top-level creative.body / .title
// fields when the creative isn't a link ad.
// ---------------------------------------------------------------------------
export function creativeToAdRow(metaAd: MetaAd): {
  creative_type: string | null;
  cta_type: string | null;
  destination_url: string | null;
  object_story_id: string | null;
  asset_feed_spec: Record<string, unknown> | null;
  creative_image_url: string | null;
  // Note: creative_video_url is NOT set here — it requires a separate
  // /{video_id}?fields=source call. meta-sync-action.ts handles that and
  // layers it onto the row before write.
  creative_video_id: string | null;
  creative_body: string | null;
  creative_headline: string | null;
  creative_cta: string | null;
  hook_type: HookType | null;
  format_style: FormatStyle | null;
} {
  const c = metaAd.creative;
  if (!c) {
    return {
      creative_type: null,
      cta_type: null,
      destination_url: null,
      object_story_id: null,
      asset_feed_spec: null,
      creative_image_url: null,
      creative_video_id: null,
      creative_body: null,
      creative_headline: null,
      creative_cta: null,
      hook_type: null,
      format_style: null,
    };
  }

  // Meta's object_type is SHARE/VIDEO/PHOTO/etc — map to something useful.
  // Dynamic creative shows up via asset_feed_spec; carousel via
  // object_story_spec.link_data.child_attachments.
  let creativeType: string | null = null;
  if (c.asset_feed_spec) {
    creativeType = "DYNAMIC";
  } else if (c.object_type === "VIDEO") {
    creativeType = "VIDEO";
  } else if (c.object_type === "SHARE" || c.object_type === "PHOTO") {
    const spec = c.object_story_spec as
      | { link_data?: { child_attachments?: unknown[] }; video_data?: unknown }
      | undefined;
    if (spec?.link_data?.child_attachments?.length) creativeType = "CAROUSEL";
    else if (spec?.video_data) creativeType = "VIDEO";
    else creativeType = "IMAGE";
  } else if (c.object_type) {
    creativeType = c.object_type;
  }

  // Pull human-readable copy following the priority Meta documents:
  // link_data.message (the "primary text") and link_data.name (the
  // "headline") are the canonical fields for link ads, with the top-level
  // body/title as legacy fallbacks for older creatives.
  const spec = (c.object_story_spec ?? {}) as {
    link_data?: {
      message?: string;
      name?: string;
      picture?: string;
      call_to_action?: { type?: string };
      // Carousel ads — child_attachments[0].picture is the canonical
      // first-card thumbnail. We pull the first one as the preview.
      child_attachments?: Array<{ picture?: string; image_url?: string }>;
    };
    video_data?: { message?: string; title?: string; image_url?: string; call_to_action?: { type?: string } };
  };

  // Dynamic creative ads ship images via asset_feed_spec.images[].url —
  // separate from object_story_spec because the asset feed is what Meta
  // uses to mix and match creative variants. We grab the first image as
  // the representative preview.
  const assetFeed = (c.asset_feed_spec ?? {}) as {
    images?: Array<{ url?: string; hash?: string }>;
    videos?: Array<{ thumbnail_url?: string; video_id?: string }>;
  };

  const body =
    spec.link_data?.message ??
    spec.video_data?.message ??
    c.body ??
    null;

  const headline =
    spec.link_data?.name ??
    spec.video_data?.title ??
    c.title ??
    null;

  // Image URL fallback chain — order matters. We try the canonical
  // top-level fields first, then dig into the spec/asset_feed paths
  // that carry thumbnails for carousel and dynamic creatives. Without
  // this, those two creative types come back as null and the library
  // shows "No preview" even though Meta has the image.
  const imageUrl =
    c.image_url ??
    c.thumbnail_url ??
    spec.link_data?.picture ??
    spec.video_data?.image_url ??
    spec.link_data?.child_attachments?.find((ch) => ch.picture || ch.image_url)
      ?.picture ??
    spec.link_data?.child_attachments?.find((ch) => ch.image_url)?.image_url ??
    assetFeed.images?.find((img) => img.url)?.url ??
    assetFeed.videos?.find((v) => v.thumbnail_url)?.thumbnail_url ??
    null;

  const cta =
    c.call_to_action_type ??
    spec.link_data?.call_to_action?.type ??
    spec.video_data?.call_to_action?.type ??
    null;

  return {
    creative_type: creativeType,
    cta_type: cta,
    destination_url: c.link_url ?? null,
    object_story_id: c.effective_object_story_id ?? null,
    asset_feed_spec: (c.asset_feed_spec as Record<string, unknown>) ?? null,
    creative_image_url: imageUrl,
    creative_video_id: c.video_id ?? null,
    creative_body: body,
    creative_headline: headline,
    creative_cta: cta,
    hook_type: classifyHookType(body, headline),
    format_style: classifyFormatStyle(creativeType, body, headline),
  };
}

// ---------------------------------------------------------------------------
// Write operations — push changes to Meta
// ---------------------------------------------------------------------------

/** Update an ad's status (ACTIVE / PAUSED). */
export async function updateAdStatus(
  metaAdId: string,
  status: "ACTIVE" | "PAUSED"
): Promise<{ success: boolean; error?: string }> {
  try {
    const { token } = getCredentials();
    const url = `${BASE_URL}/${metaAdId}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ access_token: token, status }),
    });
    const data = await res.json();
    if (data.error) {
      return { success: false, error: data.error.message ?? "Meta API error" };
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

/** Update a campaign's daily budget (in cents). */
export async function updateCampaignBudget(
  metaCampaignId: string,
  dailyBudgetCents: number
): Promise<{ success: boolean; error?: string }> {
  try {
    const { token } = getCredentials();
    const url = `${BASE_URL}/${metaCampaignId}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        access_token: token,
        daily_budget: String(dailyBudgetCents),
      }),
    });
    const data = await res.json();
    if (data.error) {
      return { success: false, error: data.error.message ?? "Meta API error" };
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

/** Update a campaign's status (ACTIVE / PAUSED). */
export async function updateCampaignStatus(
  metaCampaignId: string,
  status: "ACTIVE" | "PAUSED"
): Promise<{ success: boolean; error?: string }> {
  try {
    const { token } = getCredentials();
    const url = `${BASE_URL}/${metaCampaignId}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ access_token: token, status }),
    });
    const data = await res.json();
    if (data.error) {
      return { success: false, error: data.error.message ?? "Meta API error" };
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

/** Flatten ad set targeting into a readable audience string. */
export function targetingToAudience(adSet: MetaAdSet): string {
  const parts: string[] = [];
  const t = adSet.targeting;
  if (!t) return "";

  if (t.age_min || t.age_max) {
    parts.push(`${t.age_min ?? 18}–${t.age_max ?? 65}yo`);
  }
  if (t.genders?.length) {
    const labels = t.genders.map((g) => (g === 1 ? "Male" : g === 2 ? "Female" : "All"));
    parts.push(labels.join(", "));
  }
  if (t.geo_locations?.countries?.length) {
    parts.push(t.geo_locations.countries.join(", "));
  }
  if (t.interests?.length) {
    parts.push(t.interests.map((i) => i.name).slice(0, 5).join(", "));
  }

  return parts.join(" · ");
}
