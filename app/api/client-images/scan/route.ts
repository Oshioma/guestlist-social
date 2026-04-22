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
export const maxDuration = 45;

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
  "v","cb","t","ts","ver","rev","cachebuster","_","imwidth","imheight",
  "resize","scale","maxwidth","maxheight","thumbnail",
]);

// Strips query-param AND filename-encoded sizes so duplicate variants
// of the same image collapse to one dedup key.
// Examples handled:
//   image-300x200.jpg  (WordPress)      → image.jpg
//   image_600x.jpg     (Shopify)        → image.jpg
//   image.300x200.jpg  (some CDNs)      → image.jpg
//   image?width=800    (query param)    → image
function normalizeImageUrl(raw: string): string {
  try {
    const u = new URL(raw);
    // 1. Strip resize/cache-bust query params
    for (const key of [...u.searchParams.keys()]) {
      if (SIZE_PARAMS.has(key.toLowerCase())) u.searchParams.delete(key);
    }
    // 2. Strip filename-encoded size suffixes before the extension
    //    Matches: -300x200, _600x, _x400, .300x200 just before .jpg etc.
    u.pathname = u.pathname.replace(
      /[-_.](\d+x\d*|\d*x\d+)(?=\.[a-z]{2,5}$)/i,
      ""
    );
    return u.toString().replace(/\?$/, "");
  } catch {
    return raw;
  }
}

// Dedup key: just the filename (last path segment after normalization).
// This collapses CDN hostname variants so that e.g.
//   bushbarnfarm.co.uk/cdn/shop/files/bottle3.png?v=xxx&width=1500
//   cdn.shopify.com/s/files/1/xxxx/files/bottle3.png?v=xxx
// both map to the same key "bottle3.png" and only one is stored.
function dedupeKey(url: string): string {
  const normalized = normalizeImageUrl(url);
  try {
    const filename = new URL(normalized).pathname.split("/").pop()?.toLowerCase() ?? "";
    return filename || normalized;
  } catch {
    return normalized;
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

  // <img> — all common lazy-load and standard attributes
  const IMG_URL_ATTRS = ["src","data-src","data-lazy-src","data-original","data-image",
    "data-lazy","data-ll-src","data-flickity-lazyload","data-cfsrc"];
  for (const m of html.matchAll(/<img\b[^>]+>/gi)) {
    const tag = m[0];
    for (const attr of IMG_URL_ATTRS) {
      const val = tag.match(new RegExp(`\\b${attr}=["']([^"']+)["']`, "i"))?.[1];
      if (val && !val.includes(" ")) resolve(val);
    }
    for (const ssAttr of ["srcset", "data-srcset", "data-bgset"]) {
      const srcset = tag.match(new RegExp(`\\b${ssAttr}=["']([^"']+)["']`, "i"))?.[1];
      if (srcset) {
        for (const part of srcset.split(",")) {
          const u = part.trim().split(/\s+/)[0];
          if (u) resolve(u);
        }
      }
    }
  }

  // <div/section> with data-bg or data-background (lazy background images)
  for (const m of html.matchAll(/<(?:div|section|a|span|li)\b[^>]+>/gi)) {
    const tag = m[0];
    for (const attr of ["data-bg", "data-background", "data-background-image"]) {
      const val = tag.match(new RegExp(`\\b${attr}=["']([^"']+)["']`, "i"))?.[1];
      if (val) resolve(val);
    }
  }

  // <source srcset> inside <picture>
  for (const m of html.matchAll(/<source\b[^>]+>/gi)) {
    const tag = m[0];
    const srcset = tag.match(/\bsrcset=["']([^"']+)["']/i)?.[1];
    if (srcset) {
      for (const part of srcset.split(",")) {
        const u = part.trim().split(/\s+/)[0];
        if (u) resolve(u);
      }
    }
  }

  // og:image / twitter:image meta
  for (const m of html.matchAll(/<meta\b[^>]+>/gi)) {
    const tag = m[0];
    if (/property=["'](og:image|twitter:image)["']/i.test(tag)) {
      const content = tag.match(/\bcontent=["']([^"']+)["']/i)?.[1];
      if (content) resolve(content);
    }
  }

  // Inline style background-image and any CSS url(...)
  for (const m of html.matchAll(/url\(["']?(https?:\/\/[^"')]+)["']?\)/gi)) {
    resolve(m[1]);
  }

  // Image URLs embedded in <script> JSON blobs — catches Next.js __NEXT_DATA__,
  // Squarespace gallery JSON, Wix data, and similar JS-rendered frameworks.
  // Scan all <script> tag content for https URLs that look like images.
  for (const m of html.matchAll(/<script[\s\S]*?>([\s\S]*?)<\/script>/gi)) {
    const scriptContent = m[1];
    if (!scriptContent) continue;
    // Look for URLs ending with image extensions (with or without query params)
    for (const urlMatch of scriptContent.matchAll(
      /"(https?:\/\/[^"\\]{10,500}\.(?:jpe?g|png|webp|gif)(?:[^"\\]*)?)"/gi
    )) {
      try { resolve(urlMatch[1]); } catch { /* skip */ }
    }
    // CDN URLs without extensions (Squarespace, Imgix, etc.)
    for (const urlMatch of scriptContent.matchAll(
      /"(https?:\/\/[^"\\]{10,200}\/(?:image|images|img|photo|photos|media|upload|uploads)[^"\\]{0,200})"/gi
    )) {
      try { resolve(urlMatch[1]); } catch { /* skip */ }
    }
    // Relative asset paths — Vite/Next.js static imports become "/assets/name-hash.ext"
    for (const urlMatch of scriptContent.matchAll(
      /"(\/[a-zA-Z0-9/_-]{1,200}\.(?:jpe?g|png|webp|gif))"/gi
    )) {
      try { resolve(urlMatch[1]); } catch { /* skip */ }
    }
  }

  // Fallback: any https image URL appearing anywhere in the HTML
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

const BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
  "Accept-Language": "en-GB,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  "Cache-Control": "no-cache",
  "Pragma": "no-cache",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
  "Upgrade-Insecure-Requests": "1",
};

function isBotChallenge(html: string): boolean {
  // Cloudflare, Akamai, and similar bot challenges
  if (html.length < 5000 && (
    /just a moment/i.test(html) ||
    /checking your browser/i.test(html) ||
    /enable javascript/i.test(html) ||
    /cf-browser-verification/i.test(html) ||
    /_cf_chl_opt/i.test(html)
  )) return true;
  return false;
}

async function fetchPage(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { ...BROWSER_HEADERS, "Referer": new URL(url).origin + "/" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    if (isBotChallenge(html)) return null;
    return html;
  } catch {
    return null;
  }
}

// Shopify: /products.json is a public unauthenticated API — no auth needed
async function tryShopifyProducts(base: string): Promise<string[]> {
  try {
    const res = await fetch(`${base}/products.json?limit=250`, {
      headers: { "User-Agent": BROWSER_HEADERS["User-Agent"], "Accept": "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const json = await res.json() as { products?: Array<{ images?: Array<{ src: string }> }> };
    const urls: string[] = [];
    for (const p of json.products ?? []) {
      for (const img of p.images ?? []) {
        if (img.src) urls.push(img.src);
      }
    }
    return urls;
  } catch {
    return [];
  }
}

// WordPress: /wp-json/wp/v2/media is public for published images
async function tryWordPressMedia(base: string): Promise<string[]> {
  const urls: string[] = [];

  // Try REST API media endpoint
  try {
    const res = await fetch(`${base}/wp-json/wp/v2/media?per_page=100&media_type=image`, {
      headers: { "User-Agent": BROWSER_HEADERS["User-Agent"], "Accept": "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      const json = await res.json() as Array<{ source_url?: string; media_details?: { sizes?: Record<string, { source_url?: string }> } }>;
      if (Array.isArray(json)) {
        for (const item of json) {
          const sizes = item.media_details?.sizes ?? {};
          const full = sizes.full?.source_url ?? sizes.large?.source_url ?? item.source_url;
          if (full) urls.push(full);
        }
      }
    }
  } catch { /* skip */ }

  // Try RSS feed — contains featured images and post content images
  try {
    const res = await fetch(`${base}/feed/`, {
      headers: { "User-Agent": BROWSER_HEADERS["User-Agent"], "Accept": "application/rss+xml,text/xml,*/*" },
      signal: AbortSignal.timeout(6000),
    });
    if (res.ok) {
      const xml = await res.text();
      // <enclosure url="..."> tags
      for (const m of xml.matchAll(/<enclosure[^>]+url=["']([^"']+)["']/gi)) urls.push(m[1]);
      // <media:content url="...">
      for (const m of xml.matchAll(/<media:content[^>]+url=["']([^"']+)["']/gi)) urls.push(m[1]);
      // Image URLs inside <description> or <content:encoded>
      for (const m of xml.matchAll(/https?:\/\/[^\s"'<>]+\.(?:jpe?g|png|webp|gif)(?:\?[^\s"'<>]*)?/gi)) {
        urls.push(m[0]);
      }
    }
  } catch { /* skip */ }

  return urls;
}

// Discover extra pages from sitemap.xml / wp-sitemap.xml / sitemap_index.xml
async function discoverSitemapPages(base: string): Promise<string[]> {
  const candidates = [
    `${base}/sitemap.xml`,
    `${base}/wp-sitemap.xml`,
    `${base}/sitemap_index.xml`,
  ];
  const baseHost = new URL(base).hostname;
  const pages = new Set<string>();

  for (const url of candidates) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": BROWSER_HEADERS["User-Agent"], "Accept": "application/xml,text/xml,*/*" },
        signal: AbortSignal.timeout(6000),
      });
      if (!res.ok) continue;
      const xml = await res.text();
      // Extract <loc> entries that are HTML pages on the same host
      for (const m of xml.matchAll(/<loc>\s*(https?:\/\/[^<]+)\s*<\/loc>/gi)) {
        const loc = m[1].trim();
        try {
          const u = new URL(loc);
          if (u.hostname === baseHost && !/\.(xml|pdf|jpg|png|webp|gif)$/i.test(u.pathname)) {
            pages.add(loc);
          }
        } catch { /* skip */ }
      }
      // Sub-sitemaps: follow <sitemap><loc> entries
      for (const m of xml.matchAll(/<sitemap>[\s\S]*?<loc>\s*(https?:\/\/[^<]+)\s*<\/loc>/gi)) {
        try {
          const subRes = await fetch(m[1].trim(), {
            headers: { "User-Agent": BROWSER_HEADERS["User-Agent"] },
            signal: AbortSignal.timeout(5000),
          });
          if (!subRes.ok) continue;
          const subXml = await subRes.text();
          for (const sm of subXml.matchAll(/<loc>\s*(https?:\/\/[^<]+)\s*<\/loc>/gi)) {
            const loc = sm[1].trim();
            try {
              const u = new URL(loc);
              if (u.hostname === baseHost && !/\.(xml|pdf|jpg|png|webp|gif)$/i.test(u.pathname)) {
                pages.add(loc);
              }
            } catch { /* skip */ }
          }
        } catch { /* skip */ }
      }
      if (pages.size > 0) break; // found a working sitemap, stop
    } catch { /* skip */ }
  }

  // Sort: priority pages first, then limit
  const all = Array.from(pages);
  all.sort((a, b) => {
    const aScore = PAGE_PRIORITY_PATTERNS.some((p) => p.test(a)) ? 1 : 0;
    const bScore = PAGE_PRIORITY_PATTERNS.some((p) => p.test(b)) ? 1 : 0;
    return bScore - aScore;
  });
  return all;
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

  function sizeScore(url: string): number {
    const m = url.match(/[-_.](\d+)x(\d+)/i);
    if (!m) return 999999;
    return Number(m[1]) * Number(m[2]);
  }

  const bestByKey = new Map<string, string>();
  const addUrl = (raw: string) => {
    const key = dedupeKey(raw);
    const existing = bestByKey.get(key);
    if (!existing || sizeScore(raw) > sizeScore(existing)) bestByKey.set(key, raw);
  };

  const base = websiteUrl.replace(/\/$/, "");

  // 1. Fetch homepage + API fallbacks in parallel
  const [homeHtml, shopifyUrls, wpUrls, sitemapPages] = await Promise.all([
    fetchPage(websiteUrl),
    tryShopifyProducts(base),
    tryWordPressMedia(base),
    discoverSitemapPages(base),
  ]);

  const hasAnything = homeHtml || shopifyUrls.length > 0 || wpUrls.length > 0 || sitemapPages.length > 0;
  if (!hasAnything) {
    return NextResponse.json({
      ok: false,
      error: "This website is blocking automated access. Try using ☁️ Drive folder import instead — upload images to a shared Google Drive folder and paste the link.",
    }, { status: 502 });
  }

  // Add images from API fallbacks
  for (const url of shopifyUrls) addUrl(url);
  for (const url of wpUrls) addUrl(url);

  // 2. Extract images from homepage HTML
  if (homeHtml) {
    for (const url of extractImageUrls(homeHtml, websiteUrl)) addUrl(url);
  }

  // 3. Crawl extra pages — prefer sitemap pages, fallback to links found in HTML
  const htmlLinks = homeHtml ? extractInternalLinks(homeHtml, websiteUrl) : [];
  const extraCandidates = sitemapPages.length > 0
    ? sitemapPages.slice(0, MAX_EXTRA_PAGES * 3)
    : htmlLinks.slice(0, MAX_EXTRA_PAGES * 2);
  const extraPages = extraCandidates.slice(0, MAX_EXTRA_PAGES);

  if (extraPages.length > 0) {
    const extraHtmls = await Promise.all(extraPages.map((u) => fetchPage(u)));
    for (let i = 0; i < extraPages.length; i++) {
      const html = extraHtmls[i];
      if (!html) continue;
      for (const url of extractImageUrls(html, extraPages[i])) addUrl(url);
    }
  }

  const foundUrls = Array.from(bestByKey.values());

  if (foundUrls.length === 0) {
    return NextResponse.json({ ok: true, added: 0, images: [] });
  }

  // 4. Filter out already-saved URLs
  const { data: existing } = await db
    .from("client_site_images")
    .select("public_url")
    .eq("client_id", clientId);

  const existingSet = new Set((existing ?? []).map((r: { public_url: string }) => dedupeKey(r.public_url)));
  const newUrls = foundUrls.filter((u) => !existingSet.has(dedupeKey(u))).slice(0, MAX_IMAGES);

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
