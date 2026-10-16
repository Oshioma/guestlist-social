import "server-only";

import { createHash } from "node:crypto";
import sharp from "sharp";
import type { SupabaseClient } from "@supabase/supabase-js";

// Meta rejects oversized photos outright: Facebook /photos caps at 10 MB
// ("Can't read files", subcode 1366046) and Instagram image containers at
// 8 MB. Uploads are shrunk in the browser (uploadToStorage), but images added
// by link, from Pexels or the client library, HEIC files the browser couldn't
// decode, and photos saved before that existed can still be oversized. So the
// Proofer save swaps any such image for a resized copy, and publishing runs
// the same check as a safety net.
const META_IMAGE_MAX_BYTES = 8 * 1024 * 1024;
// Plenty for feed/story display (IG renders at most 1440px wide) while keeping
// a camera JPEG well under the limit.
const MAX_LONG_EDGE_PX = 2880;
const RESIZED_BUCKET = "postimages";
const RESIZED_FOLDER = "meta-resized";

async function headInfo(
  url: string
): Promise<{ ok: boolean; size: number | null; type: string }> {
  try {
    const res = await fetch(url, {
      method: "HEAD",
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    const len = Number(res.headers.get("content-length"));
    return {
      ok: res.ok,
      size: Number.isFinite(len) && len > 0 ? len : null,
      type: (res.headers.get("content-type") ?? "").toLowerCase(),
    };
  } catch {
    return { ok: false, size: null, type: "" };
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

  const head = await headInfo(url);
  if (head.size === null || head.size <= META_IMAGE_MAX_BYTES) return url;
  // Only still images: videos, GIFs and unknown types pass through.
  if (head.type && (!head.type.startsWith("image/") || head.type === "image/gif")) {
    return url;
  }

  // Keyed on the source URL, so a re-save or a retry re-uses the same copy
  // instead of downloading and resizing again.
  const key = createHash("sha1").update(url).digest("hex");
  const objectName = `${RESIZED_FOLDER}/${key}.jpg`;
  const resizedUrl = admin.storage.from(RESIZED_BUCKET).getPublicUrl(objectName)
    .data.publicUrl;
  if ((await headInfo(resizedUrl)).ok) return resizedUrl;

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

    const { error } = await admin.storage
      .from(RESIZED_BUCKET)
      .upload(objectName, output, {
        contentType: "image/jpeg",
        cacheControl: "3600",
        upsert: true,
      });
    if (error) return url;

    return resizedUrl;
  } catch {
    return url;
  }
}
