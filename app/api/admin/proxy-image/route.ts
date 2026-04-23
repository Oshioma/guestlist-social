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
    const res = await fetch(decoded, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (!res.ok) return new NextResponse("Upstream error", { status: res.status });

    const contentType = res.headers.get("content-type") ?? "image/jpeg";
    const buffer = await res.arrayBuffer();
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch {
    return new NextResponse("Failed to fetch image", { status: 502 });
  }
}
