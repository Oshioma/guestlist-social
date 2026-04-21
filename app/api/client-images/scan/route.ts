/**
 * POST /api/client-images/scan
 *
 * Fetches the client's website homepage plus up to MAX_EXTRA_PAGES internal
 * pages (gallery, menu, about, etc.), extracts image URLs from all of them,
 * deduplicates, and saves new ones to client_site_images.
 *
 * Body: { clientId }
 * Returns: { ok, added: number, images: ClientImage[] }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase/server";
import { createClient as serviceClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MAX_EXTRA_PAGES = 3;   // crawl up to 3 extra pages beyond the homepage
const MAX_IMAGES      = 120; // total cap to insert per scan run

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env vars");
  return serviceClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

const SKIP_PATTERNS = [
  /favicon/i, /\.svg(\?|$)/i, /\bicon\b/i,
  /sprite/i, /pixel/i, /tracking/i, /1x1/i, /placeholder/i, /blank/i,
];

// Query params that only describe a resize/format variant of the same image
const SIZE_PARAMS = new Set([
  "w","h","width","height","size","quality","q","format","fm","fit",
  "auto","cs","dpr","crop","gravity","blur","sharp","fl","pg","lossless",
]);

function normalizeImageUrl(raw: string): string {
  try {
    const u = new URL(raw);
    for (const key of [...u.searchParams.keys()]) {
      if (SIZE_PARAMS.has(key.toLowerCase())) u.searchParams.delete(key);
    }
    // Drop trailing ? if all params were removed
    return u.toString().replace(/\?$/, "");
  } catch {
    return raw;
  }
}

// Prefer extra pages that are likely to contain photos
const PAGE_PRIORITY_PATTERNS = [
  /galeri/i, /photo/i, /image/i, /media/i,
  /menu/i, /food/i, /drink/i, /dish/i,
  /about/i, /team/i, /story/i,
  /portfolio/i, /work/i, /project/i,
  /room/i, /space/i, /venue/i, /event/i,
];

function isContentImage(url: string): boolean {
  if (!url.startsWith("http")) return false;
  if (SKIP_PATTERNS.some((r) => r.test(url))) return false;
  // Accept standard image extensions
  if (/\.(jpe?g|png|webp|gif)(\?|$|#)/i.test(url)) return true;
  // Accept common image CDN patterns (Cloudinary, Imgix, Shopify, Squarespace, etc.)
  if (/\/(image|images|img|photo|photos|media|upload|uploads|assets|files)\//i.test(url) &&
      !/\.(js|css|html|pdf|zip|woff|ttf)(\?|$)/i.test(url)) return true;
  return false;
}

function extractImageUrls(html: string, base: string): string[] {
  const found = new Set<string>();

  const resolve = (src: string) => {
    try { found.add(new URL(src.trim(), base).href); } catch { /* skip malformed */ }
  };

  // <img src / srcset>
  for (const m of html.matchAll(/<img\b[^>]+>/gi)) {
    const tag = m[0];
    const src = tag.match(/\bsrc=["']([^"']+)["']/i)?.[1];
    if (src) resolve(src);
    const srcset = tag.match(/\bsrcset=["']([^"']+)["']/i)?.[1];
    if (srcset) {
      for (const part of srcset.split(",")) {
        const u = part.trim().split(/\s+/)[0];
        if (u) resolve(u);
      }
    }
    // data-src for lazy-loaded images
    const dataSrc = tag.match(/\bdata-src=["']([^"']+)["']/i)?.[1];
    if (dataSrc) resolve(dataSrc);
  }

  // og:image / twitter:image meta
  for (const m of html.matchAll(/<meta\b[^>]+>/gi)) {
    const tag = m[0];
    if (/property=["'](og:image|twitter:image)["']/i.test(tag)) {
      const content = tag.match(/\bcontent=["']([^"']+)["']/i)?.[1];
      if (content) resolve(content);
    }
  }

  // CSS background-image url(...)
  for (const m of html.matchAll(/url\(["']?(https?:\/\/[^"')]+)["']?\)/gi)) {
    resolve(m[1]);
  }

  // JSON-LD / data attributes that look like image URLs
  for (const m of html.matchAll(/"(https?:\/\/[^"]+\.(?:jpe?g|png|webp|gif))(?:\?[^"]*)?"(?:[^/])/gi)) {
    resolve(m[1]);
  }

  return Array.from(found).filter(isContentImage);
}

function extractInternalLinks(html: string, base: string): string[] {
  const baseHost = new URL(base).hostname;
  const links = new Set<string>();

  for (const m of html.matchAll(/<a\b[^>]+>/gi)) {
    const href = m[0].match(/\bhref=["']([^"']+)["']/i)?.[1];
    if (!href) continue;
    try {
      const resolved = new URL(href.trim(), base);
      if (resolved.hostname === baseHost && resolved.pathname !== "/") {
        // Normalise: drop hash and trailing slash
        resolved.hash = "";
        const clean = resolved.href.replace(/\/$/, "");
        links.add(clean);
      }
    } catch { /* skip */ }
  }

  // Sort: prioritise pages that are likely to have photos
  const all = Array.from(links);
  all.sort((a, b) => {
    const aScore = PAGE_PRIORITY_PATTERNS.some((p) => p.test(a)) ? 1 : 0;
    const bScore = PAGE_PRIORITY_PATTERNS.some((p) => p.test(b)) ? 1 : 0;
    return bScore - aScore;
  });

  return all;
}

async function fetchPage(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; GuestlistBot/1.0)" },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
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

  let websiteUrl = (clientRow as { website_url?: string } | null)?.website_url?.trim();
  if (websiteUrl && !websiteUrl.startsWith("http")) {
    websiteUrl = "https://" + websiteUrl;
  }
  if (!websiteUrl) {
    return NextResponse.json(
      { ok: false, error: "No website URL set for this client — add one on the client edit page." },
      { status: 400 }
    );
  }

  // 1. Fetch homepage
  const homeHtml = await fetchPage(websiteUrl);
  if (!homeHtml) {
    return NextResponse.json({ ok: false, error: "Could not reach website." }, { status: 502 });
  }

  // 2. Extract images from homepage + find internal links to crawl
  const allImageUrls = new Set<string>(
    extractImageUrls(homeHtml, websiteUrl).map(normalizeImageUrl)
  );
  const internalLinks = extractInternalLinks(homeHtml, websiteUrl).slice(0, MAX_EXTRA_PAGES * 2);

  // 3. Fetch extra pages in parallel (cap at MAX_EXTRA_PAGES)
  const extraPages = internalLinks.slice(0, MAX_EXTRA_PAGES);
  if (extraPages.length > 0) {
    const extraHtmls = await Promise.all(extraPages.map((u) => fetchPage(u)));
    for (let i = 0; i < extraPages.length; i++) {
      const html = extraHtmls[i];
      if (!html) continue;
      for (const url of extractImageUrls(html, extraPages[i])) {
        allImageUrls.add(normalizeImageUrl(url));
      }
    }
  }

  const foundUrls = Array.from(allImageUrls);

  if (foundUrls.length === 0) {
    return NextResponse.json({ ok: true, added: 0, images: [] });
  }

  // 4. Filter out already-saved URLs
  const { data: existing } = await db
    .from("client_site_images")
    .select("public_url")
    .eq("client_id", clientId);

  const existingSet = new Set((existing ?? []).map((r: { public_url: string }) => normalizeImageUrl(r.public_url)));
  const newUrls = foundUrls.filter((u) => !existingSet.has(u)).slice(0, MAX_IMAGES);

  if (newUrls.length === 0) {
    return NextResponse.json({ ok: true, added: 0, images: [] });
  }

  // 5. Insert
  const { data: inserted, error: insertError } = await db
    .from("client_site_images")
    .insert(newUrls.map((url) => ({ client_id: clientId, public_url: url })))
    .select("id, public_url, created_at");

  if (insertError) return NextResponse.json({ ok: false, error: insertError.message }, { status: 500 });

  const images = (inserted ?? []).map((row: { id: string; public_url: string; created_at: string }) => ({
    id: row.id,
    publicUrl: row.public_url,
    table: "site" as const,
    createdAt: row.created_at,
  }));

  return NextResponse.json({ ok: true, added: images.length, images });
}
