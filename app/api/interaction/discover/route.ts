import { NextRequest, NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { getIgScraperCredentialsInternal } from "@/app/admin-panel/interaction/actions";

export const dynamic = "force-dynamic";
export const maxDuration = 45;

// Discovery endpoint — cheap/free path, using three Meta Graph endpoints
// already covered by the IG business token the /api/interaction/instagram-comments
// route uses:
//   kind=handle    → /{ig-user-id}?fields=business_discovery.username(X){...}
//                    Pulls the competitor's recent posts + top comments.
//   kind=mentions  → /{ig-user-id}/tags?fields=...
//                    Posts that @-mention or tag the operator's IG account.
//   kind=hashtag   → requires /ig_hashtag_search + media fetch, which is
//                    gated behind Meta app review. We attempt it, and if
//                    Meta returns a permission error we surface a clear
//                    message so the operator knows to add Apify or similar.

const GRAPH = "https://graph.facebook.com/v19.0";

type DiscoveryPost = {
  id: string;
  author: string;
  authorFollowers: number | null;
  text: string;
  time: string;
  postedAtMs: number | null;
  permalink: string | null;
  mediaUrl: string;
  likeCount: number | null;
  commentCount: number | null;
  comments: DiscoveryComment[];
  source: "business_discovery" | "mentions" | "hashtag";
};

type DiscoveryComment = {
  id: string;
  author: string;
  text: string;
  time: string;
  likeCount: number | null;
};

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env vars");
  return createServiceClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function getAccount(accountId: string) {
  const db = getServiceSupabase();
  const { data } = await db
    .from("connected_meta_accounts")
    .select("account_id, access_token")
    .eq("platform", "instagram")
    .eq("account_id", accountId)
    .limit(1);
  return data?.[0] ?? null;
}

function toRelativeTime(iso: string | null | undefined): string {
  if (!iso) return "just now";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "just now";
  const mins = Math.floor((Date.now() - date.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function truncate(value: string, max: number): string {
  if (!value) return "";
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

type MetaMedia = {
  id: string;
  caption?: string;
  media_url?: string;
  thumbnail_url?: string;
  permalink?: string;
  timestamp?: string;
  like_count?: number;
  comments_count?: number;
  comments?: {
    data?: {
      id: string;
      text?: string;
      username?: string;
      timestamp?: string;
      like_count?: number;
    }[];
  };
};

function shapePost(
  media: MetaMedia,
  author: string,
  authorFollowers: number | null,
  source: DiscoveryPost["source"]
): DiscoveryPost {
  const comments: DiscoveryComment[] = (media.comments?.data ?? []).map((c) => ({
    id: c.id,
    author: `@${String(c.username ?? "").replace(/^@/, "") || "instagram_user"}`,
    text: String(c.text ?? ""),
    time: toRelativeTime(c.timestamp),
    likeCount: typeof c.like_count === "number" ? c.like_count : null,
  }));
  return {
    id: String(media.id),
    author: author.startsWith("@") ? author : `@${author}`,
    authorFollowers,
    text: truncate(String(media.caption ?? ""), 600),
    time: toRelativeTime(media.timestamp),
    postedAtMs: media.timestamp ? (new Date(media.timestamp).getTime() || null) : null,
    permalink: media.permalink ?? null,
    mediaUrl: media.thumbnail_url ?? media.media_url ?? "",
    likeCount: typeof media.like_count === "number" ? media.like_count : null,
    commentCount: typeof media.comments_count === "number" ? media.comments_count : null,
    comments,
    source,
  };
}

function explainGraphError(
  msg: string | undefined,
  code: number | undefined,
  fallback: string,
  context?: { kind?: "handle" | "mentions" | "hashtag"; value?: string }
): string {
  const base = msg ?? fallback;
  // Meta error code 10 = "Application does not have permission for this
  // action" — Business Discovery and /tags both need the
  // instagram_manage_insights (and sometimes pages_show_list) scope on
  // the access token. If the IG account was connected before the scope
  // was added to the app, the token needs to be refreshed.
  if (code === 10 || /does not have permission/i.test(base)) {
    return (
      "Meta rejected the request with permission error #10. The connected Instagram token is missing the " +
      "instagram_manage_insights (and/or pages_show_list) scope that Business Discovery and tagged-media " +
      "lookups need. Fix: in Meta App Dashboard add those permissions, then reconnect the IG account from " +
      "its client settings page so the token is reissued with the new scopes."
    );
  }
  if (code === 190 || code === 463 || code === 467) {
    return "The Instagram access token has expired or been revoked. Reconnect the account in client settings.";
  }
  // "Invalid user id" / code 100 on Business Discovery means Meta can't
  // resolve the target username. Usually the target is a personal account,
  // private, doesn't exist, or the handle came from a Facebook page vanity
  // that doesn't match the Instagram handle.
  if (
    code === 100 ||
    /invalid user id/i.test(base) ||
    /unknown path|does not exist/i.test(base)
  ) {
    const target = context?.value ? `"@${context.value}"` : "that handle";
    return (
      `Meta couldn't resolve ${target} via Business Discovery. That endpoint only works for ` +
      "public Instagram business or creator accounts. If the handle came from a Facebook page " +
      "search, the Facebook vanity URL often doesn't match the Instagram handle — try pasting " +
      "the exact IG @handle instead."
    );
  }
  return base;
}

async function fetchHandle(
  viewerId: string,
  token: string,
  handle: string
): Promise<{ ok: true; posts: DiscoveryPost[] } | { ok: false; error: string }> {
  const clean = handle.replace(/^@+/, "").trim();
  if (!clean) return { ok: false, error: "handle required" };

  const fields =
    "business_discovery.username(" +
    clean +
    "){username,followers_count,media_count," +
    "media.limit(10){id,caption,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count," +
    "comments.limit(25){id,text,username,timestamp,like_count}}}";

  const url = `${GRAPH}/${viewerId}?fields=${encodeURIComponent(
    fields
  )}&access_token=${encodeURIComponent(token)}`;

  const res = await fetch(url, { cache: "no-store" });
  const body = await res.text();
  let json: {
    business_discovery?: {
      username: string;
      followers_count?: number;
      media?: { data?: MetaMedia[] };
    };
    error?: { message?: string; code?: number };
  } | null = null;
  try {
    json = body ? JSON.parse(body) : null;
  } catch {
    json = null;
  }

  if (!res.ok || !json) {
    const errorObj = json?.error;
    const msg = explainGraphError(
      errorObj?.message,
      errorObj?.code,
      `Business Discovery lookup failed (${res.status}). Target must be a public IG business/creator account.`,
      { kind: "handle", value: clean }
    );
    return { ok: false, error: msg };
  }

  const bd = json.business_discovery;
  if (!bd) {
    return {
      ok: false,
      error: `Couldn't find @${clean} as a public Instagram business or creator account. Meta's Business Discovery only works on accounts that have switched to "Business" or "Creator" in IG settings. Personal accounts, private accounts, or Facebook-only pages won't resolve.`,
    };
  }

  const followerCount =
    typeof bd.followers_count === "number" ? bd.followers_count : null;
  const author = `@${bd.username ?? clean}`;
  const posts = (bd.media?.data ?? []).map((m) =>
    shapePost(m, author, followerCount, "business_discovery")
  );
  return { ok: true, posts };
}

async function fetchMentions(
  viewerId: string,
  token: string
): Promise<{ ok: true; posts: DiscoveryPost[] } | { ok: false; error: string }> {
  const fields =
    "id,caption,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count," +
    "username,comments.limit(15){id,text,username,timestamp,like_count}";
  const url = `${GRAPH}/${viewerId}/tags?fields=${encodeURIComponent(
    fields
  )}&limit=20&access_token=${encodeURIComponent(token)}`;

  const res = await fetch(url, { cache: "no-store" });
  const body = await res.text();
  let json: {
    data?: (MetaMedia & { username?: string })[];
    error?: { message?: string; code?: number };
  } | null = null;
  try {
    json = body ? JSON.parse(body) : null;
  } catch {
    json = null;
  }

  if (!res.ok || !json) {
    return {
      ok: false,
      error: explainGraphError(
        json?.error?.message,
        json?.error?.code,
        `Tagged media lookup failed (${res.status})`
      ),
    };
  }

  const posts = (json.data ?? []).map((m) =>
    shapePost(m, `@${m.username ?? "unknown"}`, null, "mentions")
  );
  return { ok: true, posts };
}

async function fetchHashtag(
  viewerId: string,
  token: string,
  hashtag: string
): Promise<{ ok: true; posts: DiscoveryPost[] } | { ok: false; error: string }> {
  const clean = hashtag.replace(/^#+/, "").trim();
  if (!clean) return { ok: false, error: "hashtag required" };

  // Step 1: resolve hashtag to an id
  const searchUrl = `${GRAPH}/ig_hashtag_search?user_id=${viewerId}&q=${encodeURIComponent(
    clean
  )}&access_token=${encodeURIComponent(token)}`;
  const searchRes = await fetch(searchUrl, { cache: "no-store" });
  const searchBody = await searchRes.text();
  let searchJson: { data?: { id: string }[]; error?: { message?: string } } | null =
    null;
  try {
    searchJson = searchBody ? JSON.parse(searchBody) : null;
  } catch {
    searchJson = null;
  }

  if (!searchRes.ok || !searchJson) {
    const msg =
      searchJson?.error?.message ??
      `Hashtag search is not enabled on this token. Meta gates the ig_hashtag_search endpoint behind app review — plug in Apify or a similar scraper if you need hashtag discovery.`;
    return { ok: false, error: msg };
  }

  const hashtagId = searchJson.data?.[0]?.id;
  if (!hashtagId) return { ok: true, posts: [] };

  // Step 2: recent media for that hashtag
  const mediaFields =
    "id,caption,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count," +
    "username,comments.limit(15){id,text,username,timestamp,like_count}";
  const mediaUrl = `${GRAPH}/${hashtagId}/recent_media?user_id=${viewerId}&fields=${encodeURIComponent(
    mediaFields
  )}&limit=20&access_token=${encodeURIComponent(token)}`;
  const mediaRes = await fetch(mediaUrl, { cache: "no-store" });
  const mediaBody = await mediaRes.text();
  let mediaJson: {
    data?: (MetaMedia & { username?: string })[];
    error?: { message?: string };
  } | null = null;
  try {
    mediaJson = mediaBody ? JSON.parse(mediaBody) : null;
  } catch {
    mediaJson = null;
  }

  if (!mediaRes.ok || !mediaJson) {
    return {
      ok: false,
      error: mediaJson?.error?.message ?? `Hashtag media lookup failed (${mediaRes.status})`,
    };
  }

  const posts = (mediaJson.data ?? []).map((m) =>
    shapePost(m, `@${m.username ?? "unknown"}`, null, "hashtag")
  );
  return { ok: true, posts };
}

type DiscoveredPage = {
  id: string;
  name: string;
  handle: string | null;
  url: string | null;
  fans: number | null;
  avatar: string | null;
  description: string | null;
};

// undici's "fetch failed" error is generic; the meaningful detail lives
// on err.cause (e.g. "getaddrinfo ENOTFOUND host" or "socket hang up").
// Pull whichever string looks most actionable.
function describeFetchError(err: unknown): string {
  if (!err) return "unknown error";
  const e = err as { message?: string; cause?: { code?: string; message?: string } };
  const causeBit = e.cause?.code
    ? `${e.cause.code}${e.cause.message ? ` — ${e.cause.message}` : ""}`
    : e.cause?.message ?? "";
  const base = e.message ?? String(err);
  return causeBit ? `${base} (${causeBit})` : base;
}

function getRapidApiConfig():
  | { ok: true; key: string; host: string }
  | { ok: false; error: string } {
  const key = (process.env.RAPIDAPI_FB_KEY ?? process.env.RAPIDAPI_KEY ?? "").trim();
  if (!key) {
    return {
      ok: false,
      error:
        "Keyword discovery needs a RapidAPI key. Set RAPIDAPI_FB_KEY in Vercel env vars (facebook-scraper3 on RapidAPI).",
    };
  }
  const host = (
    process.env.RAPIDAPI_FB_HOST ?? "facebook-scraper3.p.rapidapi.com"
  ).trim();
  return { ok: true, key, host };
}

function firstArrayField(obj: Record<string, unknown> | null): unknown[] {
  if (!obj) return [];
  const candidates: unknown[] = [
    obj.results,
    obj.data,
    obj.posts,
    obj.pages,
    obj.items,
    (obj.results as Record<string, unknown> | undefined)?.posts,
    (obj.results as Record<string, unknown> | undefined)?.pages,
  ];
  for (const c of candidates) if (Array.isArray(c)) return c;
  return [];
}

function parseNumericField(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value.replace(/[,\s]/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

async function fetchKeywordPosts(
  keyword: string
): Promise<{ ok: true; posts: DiscoveryPost[] } | { ok: false; error: string }> {
  const clean = keyword.replace(/^#+/, "").trim();
  if (!clean) return { ok: false, error: "keyword required" };
  const cfg = getRapidApiConfig();
  if (!cfg.ok) return cfg;

  const endpoint = `https://${cfg.host}/search/posts?query=${encodeURIComponent(clean)}`;
  const res = await fetch(endpoint, {
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      "x-rapidapi-host": cfg.host,
      "x-rapidapi-key": cfg.key,
    },
  });
  const body = await res.text();
  let json: unknown = null;
  try {
    json = body ? JSON.parse(body) : null;
  } catch {
    json = null;
  }
  if (!res.ok) {
    const msg =
      (json as { message?: string } | null)?.message ??
      `RapidAPI returned ${res.status}: ${body.slice(0, 160)}`;
    return { ok: false, error: msg };
  }

  const rows = firstArrayField(json as Record<string, unknown> | null) as Record<
    string,
    unknown
  >[];

  // Filter out big brand / page authors and keep what looks like real people.
  // Different vendors flag pages differently — we check a few common shapes.
  const BIG_ACCOUNT_FAN_LIMIT = 10000;
  const isBrandAuthor = (row: Record<string, unknown>): boolean => {
    const author = (row.author ?? row.user ?? row.owner ?? {}) as Record<
      string,
      unknown
    >;
    const type = String(author.type ?? row.author_type ?? "").toLowerCase();
    if (type === "page" || type === "business" || type === "brand") return true;
    const verified =
      Boolean(author.verified) ||
      Boolean(row.verified) ||
      Boolean(row.is_verified);
    if (verified) return true;
    const fans =
      parseNumericField(author.fans) ??
      parseNumericField(author.followers) ??
      parseNumericField(row.fans) ??
      parseNumericField(row.follower_count);
    if (fans != null && fans > BIG_ACCOUNT_FAN_LIMIT) return true;
    return false;
  };

  const posts: DiscoveryPost[] = rows
    .filter((row) => !isBrandAuthor(row))
    .map((row) => {
      const author = (row.author ?? row.user ?? row.owner ?? {}) as Record<
        string,
        unknown
      >;
      const text = String(
        row.text ?? row.message ?? row.caption ?? row.content ?? ""
      ).trim();
      if (!text && !row.image && !row.media_url) return null;
      const authorName = String(
        author.name ?? author.full_name ?? author.username ?? row.author_name ?? ""
      ).trim();
      const authorHandle = String(author.username ?? author.handle ?? "").trim();
      const display = authorHandle
        ? `@${authorHandle.replace(/^@+/, "")}`
        : authorName || "Unknown user";
      const posted =
        row.posted_at ?? row.created_time ?? row.timestamp ?? row.time ?? null;
      const postedAtMs = parseTimestampMs(posted);
      const permalink = String(
        row.url ?? row.permalink ?? row.post_url ?? ""
      ).trim() || null;
      const media = String(
        row.image ?? row.media_url ?? row.thumbnail ?? ""
      ).trim();
      const id = String(row.post_id ?? row.id ?? permalink ?? `${display}-${posted}`);
      return {
        id,
        author: display,
        authorFollowers:
          parseNumericField(author.followers) ??
          parseNumericField(author.fans) ??
          null,
        text: text.slice(0, 600),
        time: formatRelativeTime(postedAtMs),
        postedAtMs,
        permalink,
        mediaUrl: media,
        likeCount: parseNumericField(row.reaction_count ?? row.likes),
        commentCount: parseNumericField(row.comment_count ?? row.comments),
        comments: [],
        source: "hashtag",
      } as DiscoveryPost;
    })
    .filter((p): p is DiscoveryPost => p !== null)
    // Newest first. Posts with unknown timestamps sink to the bottom so
    // the top of the list always has the freshest content.
    .sort((a, b) => (b.postedAtMs ?? 0) - (a.postedAtMs ?? 0))
    .slice(0, 30);

  return { ok: true, posts };
}

function parseTimestampMs(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    return value > 1e12 ? value : value * 1000;
  }
  const str = String(value).trim();
  if (!str) return null;
  const asNum = Number(str);
  if (Number.isFinite(asNum)) {
    return asNum > 1e12 ? asNum : asNum * 1000;
  }
  const parsed = new Date(str);
  return Number.isNaN(parsed.getTime()) ? null : parsed.getTime();
}

function formatRelativeTime(ms: number | null): string {
  if (ms == null) return "recent";
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

// Resolve an Instagram location name to its numeric ID using IG's
// public web search. No authentication needed and no RapidAPI quota
// burned — it's the same endpoint the IG app itself hits when you
// type a place name. Returns null if IG blocks the request or there
// are no place matches.
async function resolveLocationIdViaInstagram(
  name: string
): Promise<string | null> {
  const clean = name.trim();
  if (!clean) return null;
  const url =
    "https://www.instagram.com/web/search/topsearch/?context=place&query=" +
    encodeURIComponent(clean);
  try {
    const res = await fetch(url, {
      cache: "no-store",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "application/json, text/javascript, */*; q=0.01",
        "Accept-Language": "en-GB,en;q=0.9",
        "X-IG-App-ID": "936619743392459",
        Referer: "https://www.instagram.com/",
      },
    });
    if (!res.ok) {
      console.warn(
        `[resolveLocationIdViaInstagram] IG topsearch returned ${res.status}`
      );
      return null;
    }
    const data = (await res.json().catch(() => null)) as
      | { places?: Array<{ place?: { location?: { pk?: string | number } } }> }
      | null;
    const first = data?.places?.[0]?.place?.location?.pk;
    if (first == null) return null;
    return String(first).trim() || null;
  } catch (err) {
    console.warn(
      "[resolveLocationIdViaInstagram] fetch failed:",
      err instanceof Error ? err.message : err
    );
    return null;
  }
}

// Instagram location discovery — finds real IG posts tagged at a
// physical location (e.g. "Kendwa Beach"). Much fresher and
// audience-relevant than Facebook keyword search, at the cost of
// another RapidAPI call per search.
//
// Two-step flow:
//   1. Resolve the location name to an ID via a search endpoint.
//   2. Fetch recent posts for that ID.
//
// Both URLs are templated via env vars so you can swap providers
// without touching code. Defaults aim at instagram-scraper-api2;
// if your chosen scraper uses different paths just override:
//   RAPIDAPI_IG_HOST
//   RAPIDAPI_IG_LOCATION_SEARCH_PATH  (use {q} placeholder)
//   RAPIDAPI_IG_LOCATION_POSTS_PATH   (use {id} placeholder)
async function fetchLocationPosts(
  query: string
): Promise<{ ok: true; posts: DiscoveryPost[] } | { ok: false; error: string }> {
  const clean = query.trim();
  if (!clean) return { ok: false, error: "location required" };

  // Prefer DB-stored settings (pasted via the Discovery tab UI) so the
  // operator doesn't need a redeploy to wire a new scraper. Fall back to
  // env vars so existing deployments keep working.
  const stored = await getIgScraperCredentialsInternal();
  const igKey = (
    stored.apiKey ??
    process.env.RAPIDAPI_IG_KEY ??
    process.env.RAPIDAPI_FB_KEY ??
    process.env.RAPIDAPI_KEY ??
    ""
  ).trim();
  if (!igKey) {
    return {
      ok: false,
      error:
        "Location discovery needs a RapidAPI Instagram scraper key. " +
        "Paste it into the RapidAPI integration panel on the Discovery tab, " +
        "or set RAPIDAPI_IG_KEY in your Vercel env vars.",
    };
  }
  const host = (
    stored.host ??
    process.env.RAPIDAPI_IG_HOST ??
    "instagram-scraper-api2.p.rapidapi.com"
  )
    .trim()
    // Operators commonly paste the full URL (https://...) or a trailing
    // slash into the host field. Strip both so the URL we build later
    // doesn't end up as "https://https://host.com/..." or host//path.
    .replace(/^https?:\/\//i, "")
    .replace(/\/+$/, "");
  // Only use a RapidAPI search path that the operator explicitly set
  // (in the Discovery panel or env vars). The old default
  // "/v1/location_search?query={q}" was fine for instagram-scraper-api2
  // but blows up with a 403 "not subscribed to this API" on scrapers
  // like instagram191 that only expose posts-by-id. Better to return a
  // clear "couldn't resolve" than to wrongly blame the subscription.
  const configuredSearchPath = (
    stored.locationSearchPath ??
    process.env.RAPIDAPI_IG_LOCATION_SEARCH_PATH ??
    ""
  ).trim();
  const searchPath = configuredSearchPath; // empty = disabled
  const postsPath = (
    stored.locationPostsPath ??
    process.env.RAPIDAPI_IG_LOCATION_POSTS_PATH ??
    "/v1/location_posts?location_id={id}"
  ).trim();

  const headers: HeadersInit = {
    "x-rapidapi-host": host,
    "x-rapidapi-key": igKey,
  };

  // Shortcut: if the operator pasted a pure numeric string, treat it as
  // a location id directly and skip the search call entirely. Saves a
  // RapidAPI quota unit per lookup and works for scrapers that don't
  // expose a search-by-name endpoint.
  let locationId: string | null = /^\d+$/.test(clean) ? clean : null;

  // Shortcut 2: if the operator pasted an Instagram location URL (from
  // the browser after searching on instagram.com), extract the numeric
  // id from the path. Handles both the raw URL and the trailing-slug
  // variant:
  //   https://www.instagram.com/explore/locations/378081362682024/
  //   https://www.instagram.com/explore/locations/378081362682024/kendwa-beach/
  if (!locationId) {
    const urlMatch = clean.match(
      /instagram\.com\/explore\/locations\/(\d+)(?:[\/?#]|$)/i
    );
    if (urlMatch) locationId = urlMatch[1];
  }

  // Name → id resolution, in order of preference (each step free-ish
  // and safe to skip):
  // 1. Instagram's own public topsearch (no scraper quota burned)
  // 2. The operator's configured RapidAPI search path, if any
  if (!locationId) {
    const igResolved = await resolveLocationIdViaInstagram(clean);
    if (igResolved) locationId = igResolved;
  }

  // Step 1: resolve location name → id (only if we don't already have one)
  if (!locationId && searchPath) {
    const searchUrl = `https://${host}${searchPath.replace(
      "{q}",
      encodeURIComponent(clean)
    )}`;
    let searchJson: unknown = null;
    try {
      const res = await fetch(searchUrl, { cache: "no-store", headers });
      const body = await res.text();
      try {
        searchJson = body ? JSON.parse(body) : null;
      } catch {
        searchJson = null;
      }
      if (!res.ok) {
        return {
          ok: false,
          error: `Location search returned ${res.status}: ${body.slice(0, 160)}`,
        };
      }
    } catch (err) {
      console.error("[location search] fetch threw", {
        url: searchUrl,
        message: err instanceof Error ? err.message : String(err),
        cause: err instanceof Error ? (err as Error & { cause?: unknown }).cause : null,
      });
      const root = describeFetchError(err);
      return {
        ok: false,
        error: `Name-lookup search failed: ${root}. Hit URL: ${searchUrl}.`,
      };
    }

    const pickLocationId = (payload: unknown): string | null => {
      if (!payload) return null;
      const tryPaths = (val: unknown): string | null => {
        if (!val) return null;
        if (typeof val === "object") {
          const rec = val as Record<string, unknown>;
          for (const key of [
            "id",
            "pk",
            "location_id",
            "facebook_places_id",
            "external_id",
          ]) {
            const v = rec[key];
            if (typeof v === "string" || typeof v === "number") {
              const str = String(v).trim();
              if (str) return str;
            }
          }
          if (rec.location && typeof rec.location === "object") {
            return tryPaths(rec.location);
          }
        }
        return null;
      };
      // First array-like shape we can find
      const arrays: unknown[] = [
        (payload as Record<string, unknown>).data,
        (payload as Record<string, unknown>).results,
        (payload as Record<string, unknown>).locations,
        (payload as Record<string, unknown>).items,
        Array.isArray(payload) ? payload : null,
      ];
      for (const arr of arrays) {
        if (Array.isArray(arr) && arr.length > 0) {
          const id = tryPaths(arr[0]);
          if (id) return id;
        }
      }
      return tryPaths(payload);
    };

    locationId = pickLocationId(searchJson);
  }

  if (!locationId) {
    return {
      ok: false,
      error: `Couldn't resolve "${clean}" automatically — Instagram blocks server-side name lookups from our IP range. Easy fix: open instagram.com in your browser, search for the place, click a result, and paste the URL here (we'll extract the ID). Or paste the numeric ID directly.`,
    };
  }

  // Step 2: fetch posts at that location
  const postsUrl = `https://${host}${postsPath.replace(
    "{id}",
    encodeURIComponent(locationId)
  )}`;
  let postsJson: unknown = null;
  try {
    const res = await fetch(postsUrl, { cache: "no-store", headers });
    const body = await res.text();
    try {
      postsJson = body ? JSON.parse(body) : null;
    } catch {
      postsJson = null;
    }
    if (!res.ok) {
      return {
        ok: false,
        error: `Location posts returned ${res.status}: ${body.slice(0, 160)}`,
      };
    }
  } catch (err) {
    console.error("[location posts] fetch threw", {
      url: postsUrl,
      message: err instanceof Error ? err.message : String(err),
      cause: err instanceof Error ? (err as Error & { cause?: unknown }).cause : null,
    });
    const root = describeFetchError(err);
    return {
      ok: false,
      error: `Posts fetch failed: ${root}. Hit URL: ${postsUrl}. Common causes: host field has "https://" in it, path template missing {id}, or upstream API is down.`,
    };
  }

  const rows = firstArrayField(
    postsJson as Record<string, unknown> | null
  ) as Record<string, unknown>[];

  const BIG_ACCOUNT_FAN_LIMIT = 10000;
  const posts: DiscoveryPost[] = rows
    .map((row) => {
      // IG scrapers nest a `media` object inside each row on some
      // providers; others hoist it to the top. Try both.
      const node = (row.media ?? row) as Record<string, unknown>;
      const user = (node.user ??
        node.owner ??
        node.author ??
        {}) as Record<string, unknown>;

      const handle = String(user.username ?? "").trim();
      const fullName = String(
        user.full_name ?? user.name ?? ""
      ).trim();
      const display = handle ? `@${handle}` : fullName || "Unknown user";

      const verified = Boolean(user.is_verified ?? user.verified);
      const fans =
        parseNumericField(user.follower_count) ??
        parseNumericField(user.followers) ??
        parseNumericField(user.fans);
      if (verified) return null;
      if (fans != null && fans > BIG_ACCOUNT_FAN_LIMIT) return null;

      const captionField = node.caption;
      const caption = String(
        (captionField && typeof captionField === "object"
          ? (captionField as Record<string, unknown>).text
          : captionField) ??
          node.text ??
          ""
      ).trim();
      if (!caption && !node.image_url && !node.media_url) return null;

      const code = String(
        node.code ?? node.shortcode ?? node.short_code ?? ""
      ).trim();
      const rawLink = String(
        node.permalink ?? node.link ?? node.url ?? ""
      ).trim();
      const permalink =
        rawLink ||
        (code ? `https://www.instagram.com/p/${code}/` : null);

      // IG image URLs live under several keys depending on provider.
      const imageCandidates =
        (node.image_versions2 as Record<string, unknown> | undefined)
          ?.candidates;
      const firstImage =
        Array.isArray(imageCandidates) && imageCandidates.length > 0
          ? String(
              (imageCandidates[0] as Record<string, unknown>).url ?? ""
            )
          : "";
      const mediaUrl = (
        String(node.thumbnail_url ?? "") ||
        firstImage ||
        String(node.media_url ?? "") ||
        String(node.display_uri ?? "") ||
        String(node.image_url ?? "") ||
        ""
      ).trim();

      const taken =
        node.taken_at_timestamp ??
        node.taken_at ??
        node.timestamp ??
        node.created_at ??
        null;
      const postedAtMs = parseTimestampMs(taken);

      const id = String(
        node.pk ?? node.id ?? code ?? permalink ?? `${display}-${taken}`
      );

      return {
        id,
        author: display,
        authorFollowers: fans ?? null,
        text: caption.slice(0, 600),
        time: formatRelativeTime(postedAtMs),
        postedAtMs,
        permalink,
        mediaUrl,
        likeCount: parseNumericField(node.like_count ?? node.likes),
        commentCount: parseNumericField(node.comment_count ?? node.comments),
        comments: [],
        source: "hashtag",
      } as DiscoveryPost;
    })
    .filter((p): p is DiscoveryPost => p !== null)
    .sort((a, b) => (b.postedAtMs ?? 0) - (a.postedAtMs ?? 0))
    .slice(0, 30);

  return { ok: true, posts };
}

async function fetchKeywordPages(
  keyword: string
): Promise<{ ok: true; pages: DiscoveredPage[] } | { ok: false; error: string }> {
  const clean = keyword.replace(/^#+/, "").trim();
  if (!clean) return { ok: false, error: "keyword required" };

  const cfg = getRapidApiConfig();
  if (!cfg.ok) return cfg;
  const host = cfg.host;
  const key = cfg.key;

  const endpoint = `https://${host}/search/pages?query=${encodeURIComponent(clean)}`;
  const res = await fetch(endpoint, {
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      "x-rapidapi-host": host,
      "x-rapidapi-key": key,
    },
  });
  const body = await res.text();
  let json: unknown = null;
  try {
    json = body ? JSON.parse(body) : null;
  } catch {
    json = null;
  }
  if (!res.ok) {
    const msg =
      (json as { message?: string } | null)?.message ??
      `RapidAPI returned ${res.status}: ${body.slice(0, 160)}`;
    return { ok: false, error: msg };
  }

  // Different RapidAPI vendors nest results differently — try the common
  // shapes in order and pick the first array we find.
  const rows = (() => {
    const obj = json as Record<string, unknown> | null;
    if (!obj) return [];
    const candidates = [
      obj.results,
      obj.data,
      obj.pages,
      (obj.results as Record<string, unknown> | undefined)?.pages,
    ];
    for (const c of candidates) {
      if (Array.isArray(c)) return c;
    }
    return [];
  })() as Record<string, unknown>[];

  const pages: DiscoveredPage[] = rows
    .map((row) => {
      const name = String(row.name ?? row.title ?? row.page_name ?? "").trim();
      if (!name) return null;
      const handle = String(
        row.username ?? row.handle ?? row.vanity ?? ""
      ).trim() || null;
      const idRaw = row.page_id ?? row.id ?? row.pageId ?? null;
      return {
        id: String(idRaw ?? name),
        name,
        handle,
        url: String(row.url ?? row.page_url ?? row.link ?? "") || null,
        fans:
          typeof row.fans === "number"
            ? row.fans
            : typeof row.followers === "number"
              ? (row.followers as number)
              : typeof row.follower_count === "number"
                ? (row.follower_count as number)
                : null,
        avatar:
          String(
            row.avatar ??
              row.image ??
              row.profile_picture ??
              row.thumbnail ??
              ""
          ) || null,
        description:
          String(row.description ?? row.about ?? row.category ?? "") || null,
      } as DiscoveredPage;
    })
    .filter((p): p is DiscoveredPage => p !== null)
    .slice(0, 25);

  return { ok: true, pages };
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const accountId = (url.searchParams.get("accountId") ?? "").trim();
  const kind = (url.searchParams.get("kind") ?? "handle").trim();
  const value = (url.searchParams.get("value") ?? "").trim();

  if (!accountId) {
    return NextResponse.json({ ok: false, error: "accountId required" }, { status: 400 });
  }

  let account: { account_id: string; access_token: string } | null = null;
  try {
    account = await getAccount(accountId);
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Supabase unavailable",
      },
      { status: 500 }
    );
  }
  if (!account) {
    return NextResponse.json(
      { ok: false, error: `No connected Instagram account for ${accountId}` },
      { status: 404 }
    );
  }

  try {
    if (kind === "handle") {
      const result = await fetchHandle(
        account.account_id,
        account.access_token,
        value
      );
      if (!result.ok) {
        return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
      }
      return NextResponse.json({ ok: true, kind, value, posts: result.posts });
    }
    if (kind === "mentions") {
      const result = await fetchMentions(account.account_id, account.access_token);
      if (!result.ok) {
        return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
      }
      return NextResponse.json({ ok: true, kind, value: "", posts: result.posts });
    }
    if (kind === "hashtag") {
      const result = await fetchHashtag(
        account.account_id,
        account.access_token,
        value
      );
      if (!result.ok) {
        return NextResponse.json(
          { ok: false, error: result.error, notSupported: true },
          { status: 400 }
        );
      }
      return NextResponse.json({ ok: true, kind, value, posts: result.posts });
    }
    if (kind === "keyword") {
      // Posts first — real people talking about the topic, filtered down
      // from big brand / verified accounts. This is what operators want
      // to interact with.
      const result = await fetchKeywordPosts(value);
      if (!result.ok) {
        return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
      }
      return NextResponse.json({ ok: true, kind, value, posts: result.posts });
    }
    if (kind === "keyword_pages") {
      // Opt-in pages search for operators who explicitly want to seed
      // competitor handle watchlists from a topic.
      const result = await fetchKeywordPages(value);
      if (!result.ok) {
        return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
      }
      return NextResponse.json({ ok: true, kind, value, pages: result.pages });
    }
    if (kind === "location") {
      const result = await fetchLocationPosts(value);
      if (!result.ok) {
        return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
      }
      return NextResponse.json({ ok: true, kind, value, posts: result.posts });
    }
    return NextResponse.json(
      { ok: false, error: `Unknown kind: ${kind}` },
      { status: 400 }
    );
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
