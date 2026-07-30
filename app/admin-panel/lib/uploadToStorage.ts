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
        upsert: true,
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
        "x-upsert": "true",
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
