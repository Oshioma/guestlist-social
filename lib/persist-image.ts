/**
 * Download an image from a URL and re-upload it to Supabase Storage.
 * Returns the permanent public URL, or null on failure.
 *
 * Used during Meta sync to persist creative thumbnails that would
 * otherwise expire when Meta rotates their CDN URLs.
 */

import { createClient } from "@supabase/supabase-js";

const BUCKET = "postimages";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function persistImageToStorage(
  sourceUrl: string,
  folder: string
): Promise<string | null> {
  if (!sourceUrl) return null;

  // Skip if already a Supabase Storage URL (already persisted)
  if (sourceUrl.includes("supabase.co/storage/")) {
    return sourceUrl;
  }

  const supabase = getSupabase();
  if (!supabase) return null;

  try {
    const res = await fetch(sourceUrl, {
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;

    const contentType = res.headers.get("content-type") ?? "image/jpeg";
    const blob = await res.blob();

    // Skip very large files (>5MB) to avoid slow syncs
    if (blob.size > 5 * 1024 * 1024) return null;

    const ext = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
    const fileName = `${folder}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;

    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(fileName, blob, {
        contentType,
        upsert: false,
      });

    if (error) {
      console.error("persistImageToStorage upload error:", error.message);
      return null;
    }

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(fileName);
    return data.publicUrl;
  } catch (err) {
    console.error("persistImageToStorage error:", err);
    return null;
  }
}
