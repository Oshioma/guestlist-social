"use client";

import { useRef, useState } from "react";
import { uploadToStorage, UPLOAD_MAX_FILE_SIZE } from "../lib/uploadToStorage";

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
    if (file.size > UPLOAD_MAX_FILE_SIZE) {
      setError("File too large (max 30 MB)");
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    setError("");
    setProgress(0);
    setUploading(true);

    try {
      const publicUrl = await uploadToStorage(file, folder, {
        bucket,
        onProgress: setProgress,
      });
      onUploaded(publicUrl);
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
