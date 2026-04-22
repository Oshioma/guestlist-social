import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 45;

type ProxyComment = {
  id?: string | number;
  commentId?: string | number;
  author?: string | null;
  username?: string | null;
  handle?: string | null;
  text?: string | null;
  comment?: string | null;
  message?: string | null;
  createdAt?: string | number | null;
  created_at?: string | number | null;
  timestamp?: string | number | null;
  posted_at?: string | number | null;
  mediaUrl?: string | null;
  imageUrl?: string | null;
  postMediaUrl?: string | null;
  permalink?: string | null;
  postUrl?: string | null;
};

type NormalizedComment = {
  id: string;
  author: string;
  text: string;
  time: string;
  mediaUrl: string;
  permalink: string | null;
  platform: "Instagram";
};

const DEFAULT_MEDIA_URL =
  "https://images.unsplash.com/photo-1490645935967-10de6ba17061?auto=format&fit=crop&w=1200&q=80";

function toDate(value: unknown): Date | null {
  if (value instanceof Date) return value;
  if (typeof value === "number") {
    const ms = value > 1e12 ? value : value * 1000;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const asNum = Number(value);
    if (Number.isFinite(asNum)) {
      const ms = asNum > 1e12 ? asNum : asNum * 1000;
      const date = new Date(ms);
      if (!Number.isNaN(date.getTime())) return date;
    }
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

function toRelativeTime(value: unknown): string {
  const date = toDate(value);
  if (!date) return "just now";
  const diffMs = Date.now() - date.getTime();
  if (diffMs <= 0) return "just now";
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function normalizeAuthor(value: string | null | undefined): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "@instagram-user";
  return raw.startsWith("@") ? raw : `@${raw}`;
}

function normalizeComment(row: ProxyComment, index: number): NormalizedComment | null {
  const id =
    row.id ?? row.commentId ?? `${String(row.username ?? row.author ?? "comment")}-${index}`;
  const text = String(row.text ?? row.comment ?? row.message ?? "").trim();
  if (!text) return null;
  const createdAt = row.createdAt ?? row.created_at ?? row.timestamp ?? row.posted_at;
  const mediaUrl = String(
    row.mediaUrl ?? row.imageUrl ?? row.postMediaUrl ?? DEFAULT_MEDIA_URL
  );
  const permalink = String(row.permalink ?? row.postUrl ?? "").trim() || null;
  return {
    id: String(id),
    author: normalizeAuthor(row.author ?? row.username ?? row.handle ?? null),
    text,
    time: toRelativeTime(createdAt),
    mediaUrl: mediaUrl || DEFAULT_MEDIA_URL,
    permalink,
    platform: "Instagram",
  };
}

function extractCommentArray(payload: unknown): ProxyComment[] {
  if (Array.isArray(payload)) return payload as ProxyComment[];
  if (!payload || typeof payload !== "object") return [];
  const obj = payload as Record<string, unknown>;
  const directKeys = ["comments", "results", "items", "data"];
  for (const key of directKeys) {
    const value = obj[key];
    if (Array.isArray(value)) return value as ProxyComment[];
    if (value && typeof value === "object") {
      const nested = value as Record<string, unknown>;
      const nestedArray =
        (Array.isArray(nested.comments) && nested.comments) ||
        (Array.isArray(nested.results) && nested.results) ||
        (Array.isArray(nested.items) && nested.items);
      if (nestedArray) return nestedArray as ProxyComment[];
    }
  }
  return [];
}

export async function POST(req: NextRequest) {
  try {
    const proxyUrl = String(process.env.INTERACTION_IG_PROXY_URL ?? "").trim();
    const proxyMethod = String(process.env.INTERACTION_IG_PROXY_METHOD ?? "POST")
      .trim()
      .toUpperCase();
    const proxyToken = String(process.env.INTERACTION_IG_PROXY_TOKEN ?? "").trim();

    if (!proxyUrl) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "INTERACTION_IG_PROXY_URL is not configured. Set it to your Instagram scraping/API proxy endpoint.",
        },
        { status: 503 }
      );
    }

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const clientId = String(body.clientId ?? "").trim();
    const handle = String(body.handle ?? "").trim();
    const limitRaw = Number(body.limit ?? 20);
    const limit = Number.isFinite(limitRaw)
      ? Math.min(100, Math.max(1, Math.floor(limitRaw)))
      : 20;

    const headers: HeadersInit = {
      Accept: "application/json",
      "Content-Type": "application/json",
    };
    if (proxyToken) {
      headers.Authorization = `Bearer ${proxyToken}`;
      headers["x-api-key"] = proxyToken;
    }

    let response: Response;
    if (proxyMethod === "GET") {
      const url = new URL(proxyUrl);
      if (clientId) url.searchParams.set("clientId", clientId);
      if (handle) url.searchParams.set("handle", handle);
      url.searchParams.set("limit", String(limit));
      response = await fetch(url.toString(), { method: "GET", headers, cache: "no-store" });
    } else {
      response = await fetch(proxyUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({ clientId, handle, limit, platform: "instagram" }),
        cache: "no-store",
      });
    }

    const rawText = await response.text();
    let payload: unknown = null;
    try {
      payload = rawText ? JSON.parse(rawText) : null;
    } catch {
      payload = null;
    }

    if (!response.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: `Proxy returned ${response.status}: ${String(
            (payload as { error?: unknown } | null)?.error ?? rawText ?? "unknown error"
          ).slice(0, 240)}`,
        },
        { status: 502 }
      );
    }

    const comments = extractCommentArray(payload)
      .map(normalizeComment)
      .filter((row): row is NormalizedComment => Boolean(row))
      .slice(0, limit);

    return NextResponse.json({
      ok: true,
      comments,
      source: "instagram-proxy",
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown ingestion error",
      },
      { status: 500 }
    );
  }
}
