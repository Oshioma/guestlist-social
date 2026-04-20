/**
 * GET /api/suggest-images?q=...&per_page=4
 *
 * Searches Pexels for royalty-free photos matching the query.
 * Requires PEXELS_API_KEY env var.
 *
 * Returns: { photos: [{ id, thumb, full, photographer, pexelsUrl }] }
 */

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ ok: false, error: "PEXELS_API_KEY not configured." }, { status: 500 });
  }

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim();
  const perPage = Math.min(Number(searchParams.get("per_page") ?? "4"), 8);

  if (!q) return NextResponse.json({ ok: false, error: "q required." }, { status: 400 });

  const res = await fetch(
    `https://api.pexels.com/v1/search?query=${encodeURIComponent(q)}&per_page=${perPage}&orientation=landscape`,
    { headers: { Authorization: apiKey } }
  );

  if (!res.ok) {
    return NextResponse.json({ ok: false, error: `Pexels error: ${res.status}` }, { status: 502 });
  }

  const data = await res.json() as {
    photos: {
      id: number;
      src: { medium: string; large: string; original: string };
      photographer: string;
      photographer_url: string;
      url: string;
    }[];
  };

  const photos = (data.photos ?? []).map((p) => ({
    id: p.id,
    thumb: p.src.medium,
    full: p.src.large,
    photographer: p.photographer,
    photographerUrl: p.photographer_url,
    pexelsUrl: p.url,
  }));

  return NextResponse.json({ ok: true, photos });
}
