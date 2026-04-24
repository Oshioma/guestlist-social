import { NextRequest, NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

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
  fallback: string
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
      `Business Discovery lookup failed (${res.status}). Target must be a public IG business/creator account.`
    );
    return { ok: false, error: msg };
  }

  const bd = json.business_discovery;
  if (!bd) {
    return {
      ok: false,
      error: `@${clean} is not a public business or creator account, or Meta could not resolve the handle.`,
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

async function fetchKeywordPages(
  keyword: string
): Promise<{ ok: true; pages: DiscoveredPage[] } | { ok: false; error: string }> {
  const clean = keyword.replace(/^#+/, "").trim();
  if (!clean) return { ok: false, error: "keyword required" };

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
      const result = await fetchKeywordPages(value);
      if (!result.ok) {
        return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
      }
      return NextResponse.json({ ok: true, kind, value, pages: result.pages });
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
