"use client";

import * as tus from "tus-js-client";
import { createClient } from "../../../lib/supabase/client";

// Supabase's resumable upload endpoint uses TUS under the hood. Files are
// sent in 6 MB chunks straight from the browser to Supabase Storage, so we
// never hit the Vercel 4.5 MB serverless body limit and very large files
// (multi-GB videos) can resume on transient failures.
export const UPLOAD_CHUNK_SIZE = 6 * 1024 * 1024;
export const UPLOAD_MAX_FILE_SIZE = 30 * 1024 * 1024; // 30 MB

// Files at or below this size go through Supabase's standard one-shot upload —
// a single request straight to Storage. The resumable (TUS) endpoint's
// handshake, and especially its 3s/5s/10s/20s retry back-off on any transient
// hiccup, make small uploads (e.g. a 3 MB photo) feel like they hang. TUS only
// earns its overhead for large files, where resumability actually matters.
const RESUMABLE_THRESHOLD = UPLOAD_CHUNK_SIZE; // 6 MB (one chunk)

const DEFAULT_BUCKET = "gsocial";

// Uploads are INSERT-only (never upsert). Supabase implements upsert as
// INSERT ... ON CONFLICT DO UPDATE, which additionally needs SELECT and UPDATE
// RLS policies on storage.objects. The public buckets deliberately have no
// SELECT policy (so they can't be listed), so an upsert fails with "new row
// violates row-level security policy". Object names are timestamped, so
// there's nothing to overwrite anyway.

// Meta rejects photos over its size limits (Facebook 10 MB, Instagram 8 MB),
// and camera JPEGs are routinely 12–15 MB. So any photo over the stricter
// Instagram limit is downscaled in the browser BEFORE it's saved — what lands
// in storage (and what the Proofer previews) is exactly what gets published.
const META_IMAGE_MAX_BYTES = 8 * 1024 * 1024;
// Plenty for feed/story display (Instagram renders at most 1440px wide).
const MAX_LONG_EDGE_PX = 2880;

function canvasToBlob(
  canvas: HTMLCanvasElement,
  quality: number
): Promise<Blob | null> {
  return new Promise((resolve) =>
    canvas.toBlob((b) => resolve(b), "image/jpeg", quality)
  );
}

/**
 * Return a copy of an oversized photo resized to fit Meta's limits, as a JPEG.
 * Small photos, GIFs (animation) and non-images are returned untouched, as is
 * anything the browser can't decode (e.g. HEIC outside Safari) — best-effort,
 * so an upload never fails because of this step.
 */
async function shrinkOversizedImage(file: File): Promise<File> {
  if (
    !file.type.startsWith("image/") ||
    file.type === "image/gif" ||
    file.size <= META_IMAGE_MAX_BYTES
  ) {
    return file;
  }
  try {
    // from-image applies EXIF orientation so portrait shots stay upright.
    const bitmap = await createImageBitmap(file, {
      imageOrientation: "from-image",
    });
    const scale = Math.min(
      1,
      MAX_LONG_EDGE_PX / Math.max(bitmap.width, bitmap.height)
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.fillStyle = "#ffffff"; // JPEG has no alpha; flatten onto white
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();

    for (const quality of [0.85, 0.75, 0.65]) {
      const blob = await canvasToBlob(canvas, quality);
      if (blob && blob.size <= META_IMAGE_MAX_BYTES) {
        const base = file.name.replace(/\.[^/.]+$/, "") || "image";
        return new File([blob], `${base}.jpg`, {
          type: "image/jpeg",
          lastModified: file.lastModified,
        });
      }
    }
  } catch {
    // Undecodable in this browser — upload the original as before.
  }
  return file;
}

type UploadOptions = {
  bucket?: string;
  onProgress?: (percent: number) => void;
};

/**
 * Upload a File (or clipboard/File-like blob) directly to Supabase Storage and
 * return its public URL. Shared by the ImageUpload button and paste-to-attach.
 */
export async function uploadToStorage(
  file: File,
  folder: string,
  { bucket, onProgress }: UploadOptions = {}
): Promise<string> {
  file = await shrinkOversizedImage(file);

  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    throw new Error("Not signed in");
  }

  const targetBucket = bucket || DEFAULT_BUCKET;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;

  const ext = file.name.split(".").pop() || "bin";
  const timestamp = Date.now();
  const safeName =
    file.name
      .replace(/\.[^/.]+$/, "")
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .slice(0, 60) || "file";
  const objectName = `${folder}/${timestamp}_${safeName}.${ext}`;

  // Fast path for small files: one direct request, no resumable handshake or
  // retry back-off. This is what makes a 3 MB photo upload feel instant.
  if (file.size <= RESUMABLE_THRESHOLD) {
    onProgress?.(0);
    const { error } = await supabase.storage
      .from(targetBucket)
      .upload(objectName, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type || undefined,
      });
    if (error) throw error;
    onProgress?.(100);
    const { data } = supabase.storage
      .from(targetBucket)
      .getPublicUrl(objectName);
    return data.publicUrl;
  }

  await new Promise<void>((resolve, reject) => {
    const upload = new tus.Upload(file, {
      endpoint: `${supabaseUrl}/storage/v1/upload/resumable`,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      headers: {
        authorization: `Bearer ${session.access_token}`,
        "x-upsert": "false",
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      metadata: {
        bucketName: targetBucket,
        objectName,
        contentType: file.type || "application/octet-stream",
        cacheControl: "3600",
      },
      chunkSize: UPLOAD_CHUNK_SIZE,
      onError(err) {
        reject(err);
      },
      onProgress(bytesUploaded, bytesTotal) {
        if (bytesTotal > 0 && onProgress) {
          onProgress(Math.round((bytesUploaded / bytesTotal) * 100));
        }
      },
      onSuccess() {
        resolve();
      },
    });

    upload.findPreviousUploads().then((previous) => {
      if (previous.length > 0) {
        upload.resumeFromPreviousUpload(previous[0]);
      }
      upload.start();
    });
  });

  const { data } = supabase.storage.from(targetBucket).getPublicUrl(objectName);
  return data.publicUrl;
}
