import "server-only";

import { createHash } from "node:crypto";
import sharp from "sharp";
import type { SupabaseClient } from "@supabase/supabase-js";

// Meta rejects oversized photos outright: Facebook /photos caps at 10 MB
// ("Can't read files", subcode 1366046) and Instagram image containers at
// 8 MB. Operators upload straight-off-the-camera JPEGs of 12–15 MB, so before
// handing an image URL to Meta we check its size and, if it's over the
// stricter Instagram limit, publish a resized copy instead. The original in
// the Proofer is never touched.
const META_IMAGE_MAX_BYTES = 8 * 1024 * 1024;
// Plenty for feed/story display (IG renders at most 1440px wide) while keeping
// a camera JPEG well under the limit.
const MAX_LONG_EDGE_PX = 2880;
const RESIZED_BUCKET = "postimages";
const RESIZED_FOLDER = "meta-resized";

async function contentLength(url: string): Promise<number | null> {
  try {
    const res = await fetch(url, {
      method: "HEAD",
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const len = Number(res.headers.get("content-length"));
    return Number.isFinite(len) && len > 0 ? len : null;
  } catch {
    return null;
  }
}

/**
 * Return a URL Meta will accept for this image: the original when it's within
 * the size limit (or can't be checked), otherwise a resized JPEG copy uploaded
 * to storage. Videos and GIFs are passed through untouched. Best-effort: any
 * failure falls back to the original URL so publishing behaves as before.
 */
export async function ensureMetaSizedImage(
  admin: SupabaseClient,
  url: string
): Promise<string> {
  if (!url || /\.gif(\?|$)/i.test(url)) return url;

  const size = await contentLength(url);
  if (size === null || size <= META_IMAGE_MAX_BYTES) return url;

  try {
    const res = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return url;
    const input = Buffer.from(await res.arrayBuffer());

    let output: Buffer | null = null;
    for (const quality of [85, 75, 65]) {
      const buf = await sharp(input)
        .rotate() // bake in EXIF orientation before metadata is stripped
        .resize({
          width: MAX_LONG_EDGE_PX,
          height: MAX_LONG_EDGE_PX,
          fit: "inside",
          withoutEnlargement: true,
        })
        .flatten({ background: "#ffffff" }) // JPEG has no alpha
        .jpeg({ quality, mozjpeg: true })
        .toBuffer();
      if (buf.length <= META_IMAGE_MAX_BYTES) {
        output = buf;
        break;
      }
    }
    if (!output) return url;

    // Keyed on the source URL so a retry re-uses the same object.
    const key = createHash("sha1").update(url).digest("hex");
    const objectName = `${RESIZED_FOLDER}/${key}.jpg`;
    const { error } = await admin.storage
      .from(RESIZED_BUCKET)
      .upload(objectName, output, {
        contentType: "image/jpeg",
        cacheControl: "3600",
        upsert: true,
      });
    if (error) return url;

    return admin.storage.from(RESIZED_BUCKET).getPublicUrl(objectName).data
      .publicUrl;
  } catch {
    return url;
  }
}
