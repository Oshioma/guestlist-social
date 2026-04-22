import { NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const GRAPH = "https://graph.facebook.com/v19.0";

const LOCATION_TAGS = ["zanzibar", "kendwa", "nungwi"];

const LABEL_PATTERNS: Record<string, RegExp> = {
  Question:       /\?|\b(where|when|how|what|who|which|why|can you|do you|is there|are you|have you|will you|would you|could you)\b/i,
  Complaint:      /\b(disappointed|terrible|awful|horrible|bad service|rubbish|worst|not happy|unhappy|disgusting|unacceptable|appalling|dreadful|rip.?off|overpriced|rude|never again|waited too long|wasted)\b/i,
  Recommendation: /\b(recommend|suggestion|suggest|advice|advise|should i|worth it|worth visiting|good place|best place|any tips|what to order|what should|worth going|must try|tips for)\b/i,
};

function detectLabel(text: string): string | null {
  for (const [label, pattern] of Object.entries(LABEL_PATTERNS)) {
    if (pattern.test(text)) return label;
  }
  return null;
}

function detectLocations(text: string): string[] {
  const lower = text.toLowerCase();
  return LOCATION_TAGS
    .filter((loc) => lower.includes(loc))
    .map((loc) => loc[0].toUpperCase() + loc.slice(1));
}

function detectKeywords(text: string, keywords: string[]): string[] {
  const lower = text.toLowerCase();
  return keywords.filter((kw) => lower.includes(kw.toLowerCase()));
}

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env vars");
  return createServiceClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

type RawComment = {
  id: string;
  username: string;
  text: string;
  timestamp: string;
  likeCount: number;
  postId: string;
  postUrl: string;
  platform: "facebook" | "instagram";
};

async function fetchFacebookComments(pageId: string, token: string, postsLimit = 8): Promise<RawComment[]> {
  const postsRes = await fetch(
    `${GRAPH}/${pageId}/posts?fields=id,message,created_time&limit=${postsLimit}&access_token=${token}`
  );
  if (!postsRes.ok) {
    const err = await postsRes.json().catch(() => ({}));
    throw new Error(`Facebook posts error: ${(err as { error?: { message?: string } }).error?.message ?? postsRes.status}`);
  }
  const postsData = await postsRes.json() as { data?: { id: string }[] };
  const posts = postsData.data ?? [];

  const all: RawComment[] = [];
  await Promise.all(
    posts.slice(0, 6).map(async (post) => {
      const res = await fetch(
        `${GRAPH}/${post.id}/comments?fields=id,message,from,created_time,like_count&limit=25&access_token=${token}`
      );
      if (!res.ok) return;
      const d = await res.json() as { data?: { id: string; message?: string; from?: { name?: string }; created_time?: string; like_count?: number }[] };
      for (const c of d.data ?? []) {
        all.push({
          id: c.id,
          username: c.from?.name ?? "unknown",
          text: c.message ?? "",
          timestamp: c.created_time ?? "",
          likeCount: c.like_count ?? 0,
          postId: post.id,
          postUrl: `https://www.facebook.com/${post.id}`,
          platform: "facebook",
        });
      }
    })
  );
  return all;
}

async function fetchInstagramComments(igUserId: string, token: string, mediaLimit = 8): Promise<RawComment[]> {
  const mediaRes = await fetch(
    `${GRAPH}/${igUserId}/media?fields=id,caption,timestamp,permalink&limit=${mediaLimit}&access_token=${token}`
  );
  if (!mediaRes.ok) {
    const err = await mediaRes.json().catch(() => ({}));
    throw new Error(`Instagram media error: ${(err as { error?: { message?: string } }).error?.message ?? mediaRes.status}`);
  }
  const mediaData = await mediaRes.json() as { data?: { id: string; permalink?: string }[] };
  const media = mediaData.data ?? [];

  const all: RawComment[] = [];
  await Promise.all(
    media.slice(0, 6).map(async (m) => {
      const res = await fetch(
        `${GRAPH}/${m.id}/comments?fields=id,text,username,timestamp,like_count&limit=25&access_token=${token}`
      );
      if (!res.ok) return;
      const d = await res.json() as { data?: { id: string; text?: string; username?: string; timestamp?: string; like_count?: number }[] };
      for (const c of d.data ?? []) {
        all.push({
          id: c.id,
          username: c.username ?? "unknown",
          text: c.text ?? "",
          timestamp: c.timestamp ?? "",
          likeCount: c.like_count ?? 0,
          postId: m.id,
          postUrl: m.permalink ?? "",
          platform: "instagram",
        });
      }
    })
  );
  return all;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const clientId = url.searchParams.get("clientId") ?? "";
  const platformFilter = url.searchParams.get("platform") ?? "both";
  const limit = Math.min(Number(url.searchParams.get("limit") ?? "50"), 200);

  const keywordsEnv = process.env.INTERACTION_IG_KEYWORDS
    ?? "zanzibar,kendwa,nungwi,restaurant,lunch,dinner,smoothie,food";
  const keywords = keywordsEnv.split(",").map((k) => k.trim()).filter(Boolean);

  if (!clientId) {
    return NextResponse.json({ ok: false, error: "clientId required" }, { status: 400 });
  }

  try {
    const db = getServiceSupabase();

    const { data: accounts } = await db
      .from("connected_meta_accounts")
      .select("platform, account_id, access_token")
      .eq("client_id", clientId);

    if (!accounts || accounts.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          noAccounts: true,
          error:
            "No connected Meta accounts for this client. Go to the client page and connect a Facebook Page or Instagram account.",
        },
        { status: 404 }
      );
    }

    const errors: string[] = [];
    const all: RawComment[] = [];

    await Promise.all(
      accounts.map(async (account: { platform: string; account_id: string; access_token: string }) => {
        if (platformFilter !== "both" && account.platform !== platformFilter) return;
        try {
          if (account.platform === "facebook") {
            const comments = await fetchFacebookComments(account.account_id, account.access_token);
            all.push(...comments);
          } else if (account.platform === "instagram") {
            const comments = await fetchInstagramComments(account.account_id, account.access_token);
            all.push(...comments);
          }
        } catch (err) {
          errors.push(`${account.platform}: ${err instanceof Error ? err.message : "unknown error"}`);
        }
      })
    );

    // Sort newest first
    all.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    const comments = all.slice(0, limit).map((c) => ({
      ...c,
      label: detectLabel(c.text),
      locationTags: detectLocations(c.text),
      keywordMatches: detectKeywords(c.text, keywords),
    }));

    return NextResponse.json({
      ok: true,
      comments,
      keywords,
      ...(errors.length > 0 ? { warnings: errors } : {}),
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Error fetching comments" },
      { status: 500 }
    );
  }
}
