import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Proxies external images (e.g. Instagram CDN) to avoid CORS/referrer blocks.
// Usage: /api/admin/proxy-image?url=<encoded-url>
export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url) return new NextResponse("Missing url", { status: 400 });

  let decoded: string;
  try {
    decoded = decodeURIComponent(url);
    new URL(decoded); // validate it's a real URL
  } catch {
    return new NextResponse("Invalid url", { status: 400 });
  }

  // Only allow Instagram and Facebook CDN domains
  const allowed = ["cdninstagram.com", "fbcdn.net", "scontent", "instagram.com"];
  if (!allowed.some((d) => decoded.includes(d))) {
    return new NextResponse("Domain not allowed", { status: 403 });
  }

  try {
    // Meta CDN URLs are signed but sometimes reject requests without a
    // browser-like Referer. Passing https://www.instagram.com/ consistently
    // gets past that check without needing any tokens.
    const res = await fetch(decoded, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Referer: "https://www.instagram.com/",
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      },
    });
    if (!res.ok) {
      console.error(`[proxy-image] upstream ${res.status} for`, decoded.slice(0, 120));
      return new NextResponse("Upstream error", { status: res.status });
    }

    const contentType = res.headers.get("content-type") ?? "image/jpeg";
    const buffer = await res.arrayBuffer();
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        // Only cache successful responses, and for a short window since
        // IG CDN signatures rotate.
        "Cache-Control": "public, max-age=900, s-maxage=900",
      },
    });
  } catch (err) {
    console.error("[proxy-image] fetch threw:", err);
    return new NextResponse("Failed to fetch image", { status: 502 });
  }
}
