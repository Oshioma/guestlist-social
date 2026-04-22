import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const LOCATION_TAGS = ["zanzibar", "kendwa", "nungwi"];

const LABEL_PATTERNS: Record<string, RegExp> = {
  Question: /\?|\b(where|when|how|what|who|which|why|can you|do you|is there|are you|have you|will you|would you|could you)\b/i,
  Complaint: /\b(disappointed|terrible|awful|horrible|bad service|rubbish|worst|not happy|unhappy|disgusting|unacceptable|appalling|dreadful|rip.?off|overpriced|rude|never again|waited too long|wasted)\b/i,
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

function normalizeComment(raw: Record<string, unknown>, keywords: string[]) {
  const text = String(raw.text ?? raw.comment ?? raw.message ?? raw.commentText ?? raw.body ?? "");
  const id = String(raw.id ?? raw.commentId ?? raw.pk ?? "");
  const username = String(
    raw.username ?? raw.ownerUsername ?? raw.author ?? raw.authorUsername ??
    raw.owner_username ?? raw.from_username ?? "unknown"
  );
  const timestamp = String(
    raw.timestamp ?? raw.createdAt ?? raw.created_at ?? raw.time ?? raw.date ?? raw.posted_at ?? ""
  );
  const likeCount = Number(raw.likesCount ?? raw.likeCount ?? raw.likes_count ?? raw.likes ?? 0);
  const postId = String(raw.postId ?? raw.post_id ?? raw.mediaId ?? raw.media_id ?? "");
  const postUrl = String(raw.postUrl ?? raw.post_url ?? raw.url ?? raw.link ?? raw.postLink ?? "");

  return {
    id: id || String(Math.random()),
    username,
    text,
    timestamp,
    likeCount,
    postId,
    postUrl,
    label: detectLabel(text),
    locationTags: detectLocations(text),
    keywordMatches: detectKeywords(text, keywords),
  };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const handle = url.searchParams.get("handle") ?? "";
  const limit = Math.min(Number(url.searchParams.get("limit") ?? "50"), 200);

  const sourceUrl = process.env.INTERACTION_IG_SOURCE_URL;
  const authHeader = process.env.INTERACTION_IG_SOURCE_AUTH_HEADER;
  const keywordsEnv = process.env.INTERACTION_IG_KEYWORDS
    ?? "zanzibar,kendwa,nungwi,restaurant,lunch,dinner,smoothie,food";
  const keywords = keywordsEnv.split(",").map((k) => k.trim()).filter(Boolean);

  if (!sourceUrl) {
    return NextResponse.json(
      {
        ok: false,
        setup: true,
        error:
          "INTERACTION_IG_SOURCE_URL is not configured. Add it to your Vercel environment variables.",
      },
      { status: 500 }
    );
  }

  try {
    const fetchUrl = new URL(sourceUrl);
    if (handle) fetchUrl.searchParams.set("handle", handle);
    fetchUrl.searchParams.set("limit", String(limit));

    const headers: Record<string, string> = { Accept: "application/json" };
    if (authHeader) headers["Authorization"] = authHeader;

    const res = await fetch(fetchUrl.toString(), { headers, cache: "no-store" });

    if (!res.ok) {
      const errText = await res.text().catch(() => res.statusText);
      return NextResponse.json(
        { ok: false, error: `Source returned ${res.status}: ${errText.slice(0, 300)}` },
        { status: 502 }
      );
    }

    const data = await res.json();

    const raw: unknown[] = Array.isArray(data)
      ? data
      : Array.isArray(data.comments)
      ? data.comments
      : Array.isArray(data.data)
      ? data.data
      : Array.isArray(data.items)
      ? data.items
      : Array.isArray(data.results)
      ? data.results
      : [];

    const comments = raw
      .slice(0, limit)
      .map((c) => normalizeComment(c as Record<string, unknown>, keywords));

    return NextResponse.json({ ok: true, comments, keywords });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed to reach source." },
      { status: 500 }
    );
  }
}
