/**
 * POST /api/client-images/scan
 *
 * Fetches the client's website_url, extracts image URLs from the HTML
 * (img src, og:image meta, srcset), saves new ones to client_images.
 *
 * Body: { clientId }
 * Returns: { ok, added: number, images: ClientImage[] }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase/server";
import { createClient as serviceClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env vars");
  return serviceClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

const SKIP_PATTERNS = [
  /favicon/i, /\.svg(\?|$)/i, /icon/i, /logo/i,
  /sprite/i, /pixel/i, /tracking/i, /1x1/i,
  /placeholder/i, /blank/i,
];

function isContentImage(url: string): boolean {
  if (!url.startsWith("http")) return false;
  if (SKIP_PATTERNS.some((r) => r.test(url))) return false;
  return /\.(jpe?g|png|webp|gif)(\?|$|#)/i.test(url);
}

function extractUrls(html: string, base: string): string[] {
  const found = new Set<string>();

  const resolve = (src: string) => {
    try { found.add(new URL(src.trim(), base).href); } catch { /* skip */ }
  };

  // <img src="..."> and <img srcset="...">
  for (const m of html.matchAll(/<img\b[^>]+>/gi)) {
    const tag = m[0];
    const src = tag.match(/\bsrc=["']([^"']+)["']/i)?.[1];
    if (src) resolve(src);

    // srcset may contain multiple URLs
    const srcset = tag.match(/\bsrcset=["']([^"']+)["']/i)?.[1];
    if (srcset) {
      for (const part of srcset.split(",")) {
        const u = part.trim().split(/\s+/)[0];
        if (u) resolve(u);
      }
    }
  }

  // <meta property="og:image" content="...">
  for (const m of html.matchAll(/<meta\b[^>]+>/gi)) {
    const tag = m[0];
    if (/property=["']og:image["']/i.test(tag)) {
      const content = tag.match(/\bcontent=["']([^"']+)["']/i)?.[1];
      if (content) resolve(content);
    }
  }

  // CSS url(...) in inline styles
  for (const m of html.matchAll(/url\(["']?(https?:\/\/[^"')]+)["']?\)/gi)) {
    resolve(m[1]);
  }

  return Array.from(found).filter(isContentImage);
}

export async function POST(req: NextRequest) {
  const authSupabase = await createClient();
  const { data: { user } } = await authSupabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const clientId = String(body.clientId ?? "").trim();
  if (!clientId) return NextResponse.json({ ok: false, error: "clientId required" }, { status: 400 });

  const db = getServiceSupabase();

  const { data: clientRow } = await db
    .from("clients")
    .select("website_url")
    .eq("id", clientId)
    .single();

  const websiteUrl = (clientRow as { website_url?: string } | null)?.website_url;
  if (!websiteUrl) {
    return NextResponse.json(
      { ok: false, error: "No website URL set for this client — add one on the client edit page." },
      { status: 400 }
    );
  }

  let html: string;
  try {
    const res = await fetch(websiteUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; GuestlistBot/1.0)" },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) {
      return NextResponse.json({ ok: false, error: `Website returned HTTP ${res.status}` }, { status: 502 });
    }
    html = await res.text();
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: `Could not reach website: ${err instanceof Error ? err.message : "network error"}` },
      { status: 502 }
    );
  }

  const foundUrls = extractUrls(html, websiteUrl);
  if (foundUrls.length === 0) {
    return NextResponse.json({ ok: true, added: 0, images: [] });
  }

  // Deduplicate against what's already in the library
  const { data: existing } = await db
    .from("client_images")
    .select("public_url")
    .eq("client_id", clientId);

  const existingSet = new Set((existing ?? []).map((r: { public_url: string }) => r.public_url));
  const newUrls = foundUrls.filter((u) => !existingSet.has(u)).slice(0, 60);

  if (newUrls.length === 0) {
    return NextResponse.json({ ok: true, added: 0, images: [] });
  }

  const { data: inserted, error: insertError } = await db
    .from("client_images")
    .insert(newUrls.map((url) => ({ client_id: clientId, public_url: url, source: "website_scan" })))
    .select("id, public_url, source, created_at");

  if (insertError) return NextResponse.json({ ok: false, error: insertError.message }, { status: 500 });

  const images = (inserted ?? []).map((row: { id: string; public_url: string; source: string; created_at: string }) => ({
    id: row.id,
    publicUrl: row.public_url,
    source: row.source,
    createdAt: row.created_at,
  }));

  return NextResponse.json({ ok: true, added: images.length, images });
}
