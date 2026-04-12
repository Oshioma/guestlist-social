"use client";

import { useRef, useState } from "react";
import * as tus from "tus-js-client";
import { createClient } from "../../../lib/supabase/client";

type Props = {
  folder: string;
  onUploaded: (url: string) => void;
  label?: string;
  compact?: boolean;
  bucket?: string;
  /**
   * Accepted mime type string for the file picker. Defaults to images only.
   * Pass "image/*,video/*" to accept videos too.
   */
  accept?: string;
};

const DEFAULT_BUCKET = "gsocial";

// Supabase's resumable upload endpoint uses TUS under the hood. Files are
// sent in 6 MB chunks straight from the browser to Supabase Storage, so we
// never hit the Vercel 4.5 MB serverless body limit and very large files
// (multi-GB videos) can resume on transient failures.
const CHUNK_SIZE = 6 * 1024 * 1024;

export default function ImageUpload({
  folder,
  onUploaded,
  label,
  compact,
  bucket,
  accept,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    setProgress(0);
    setUploading(true);

    try {
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
      const safeName = file.name
        .replace(/\.[^/.]+$/, "")
        .replace(/[^a-zA-Z0-9_-]/g, "_")
        .slice(0, 60);
      const objectName = `${folder}/${timestamp}_${safeName}.${ext}`;

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
          chunkSize: CHUNK_SIZE,
          onError(err) {
            reject(err);
          },
          onProgress(bytesUploaded, bytesTotal) {
            if (bytesTotal > 0) {
              setProgress(Math.round((bytesUploaded / bytesTotal) * 100));
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

      const { data } = supabase.storage
        .from(targetBucket)
        .getPublicUrl(objectName);

      onUploaded(data.publicUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      setProgress(0);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
      <input
        ref={inputRef}
        type="file"
        accept={accept || "image/*"}
        onChange={handleFile}
        style={{ display: "none" }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        style={{
          padding: compact ? "2px 6px" : "4px 10px",
          fontSize: compact ? 10 : 12,
          fontWeight: 600,
          border: "none",
          borderRadius: 6,
          background: uploading ? "#e4e4e7" : "#ede9fe",
          color: uploading ? "#a1a1aa" : "#5b21b6",
          cursor: uploading ? "wait" : "pointer",
          whiteSpace: "nowrap",
        }}
      >
        {uploading
          ? progress > 0
            ? `Uploading ${progress}%`
            : "Uploading..."
          : label || "Upload"}
      </button>
      {error && (
        <span style={{ fontSize: 10, color: "#dc2626" }}>{error}</span>
      )}
    </span>
  );
}
