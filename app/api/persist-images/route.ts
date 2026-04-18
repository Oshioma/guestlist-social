/**
 * POST /api/persist-images
 *
 * One-off endpoint: finds ads with Meta CDN image URLs (not yet
 * persisted to Supabase Storage) and re-uploads them. Processes
 * a small batch per call to stay within Vercel's timeout.
 *
 * Call repeatedly until it returns persisted: 0.
 */

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { persistImageToStorage } from "@/lib/persist-image";

export const dynamic = "force-dynamic";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing supabase env vars.");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function POST() {
  const supabase = getSupabase();

  // Find ads with non-Supabase image URLs (max 5 per batch to stay fast)
  const { data: ads } = await supabase
    .from("ads")
    .select("id, meta_id, creative_image_url")
    .not("creative_image_url", "is", null)
    .not("creative_image_url", "like", "%supabase.co/storage%")
    .limit(5);

  if (!ads || ads.length === 0) {
    return NextResponse.json({ ok: true, persisted: 0, message: "All images already persisted" });
  }

  let persisted = 0;
  let failed = 0;

  for (const ad of ads) {
    const url = ad.creative_image_url as string;
    if (!url) continue;

    const permanent = await persistImageToStorage(
      url,
      `meta-creatives/${ad.meta_id ?? ad.id}`
    );

    if (permanent) {
      await supabase
        .from("ads")
        .update({ creative_image_url: permanent })
        .eq("id", ad.id);
      persisted++;
    } else {
      failed++;
    }
  }

  return NextResponse.json({
    ok: true,
    persisted,
    failed,
    remaining: ads.length - persisted,
    message: persisted > 0 ? `Persisted ${persisted} images. Call again for more.` : "No images could be downloaded (may be expired).",
  });
}

export async function GET() {
  return POST();
}
