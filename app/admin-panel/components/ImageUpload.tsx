"use client";

import { useRef, useState } from "react";
import { uploadToStorage, UPLOAD_MAX_FILE_SIZE } from "../lib/uploadToStorage";

type Props = {
  folder: string;
  /**
   * Called once per uploaded file. With `multiple`, it fires for each file in
   * the order picked, so callers must append using up-to-date state (e.g. a
   * functional setState) rather than a render-time snapshot.
   */
  onUploaded: (url: string) => void;
  label?: string;
  compact?: boolean;
  bucket?: string;
  /**
   * Accepted mime type string for the file picker. Defaults to images only.
   * Pass "image/*,video/*" to accept videos too.
   */
  accept?: string;
  /** Let the picker select several files at once; each is uploaded in turn. */
  multiple?: boolean;
  /**
   * Optional style override merged over the default button styling (used to
   * make the button match a surrounding row). The uploading state still wins
   * so progress feedback is never hidden.
   */
  buttonStyle?: React.CSSProperties;
  /**
   * Max accepted file size in bytes. Defaults to the shared image limit; video
   * uploaders pass a larger, plan-derived ceiling (see maxVideoUploadBytes()).
   */
  maxBytes?: number;
};

export default function ImageUpload({
  folder,
  onUploaded,
  label,
  compact,
  bucket,
  accept,
  multiple,
  buttonStyle,
  maxBytes = UPLOAD_MAX_FILE_SIZE,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  // Position in a multi-file batch: "2/5". null for a single file.
  const [batch, setBatch] = useState<{ index: number; total: number } | null>(null);
  const [error, setError] = useState("");

  async function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (inputRef.current) inputRef.current.value = "";
    if (files.length === 0) return;

    const mb = Math.round(maxBytes / (1024 * 1024));
    const accepted = files.filter((f) => f.size <= maxBytes);
    const oversized = files.length - accepted.length;
    const errors: string[] = [];
    if (oversized > 0) {
      errors.push(
        files.length === 1
          ? `File too large (max ${mb} MB)`
          : `${oversized} file${oversized !== 1 ? "s" : ""} over ${mb} MB skipped`
      );
    }
    setError(errors.join(" · "));
    if (accepted.length === 0) return;

    setUploading(true);
    let failed = 0;
    let lastFailure = "";
    try {
      // Sequential, so images land on the post in the order they were picked.
      for (let i = 0; i < accepted.length; i++) {
        setBatch(accepted.length > 1 ? { index: i + 1, total: accepted.length } : null);
        setProgress(0);
        try {
          const publicUrl = await uploadToStorage(accepted[i], folder, {
            bucket,
            onProgress: setProgress,
          });
          onUploaded(publicUrl);
        } catch (err) {
          failed++;
          lastFailure = err instanceof Error ? err.message : "Upload failed";
        }
      }
    } finally {
      setUploading(false);
      setProgress(0);
      setBatch(null);
    }

    if (failed > 0) {
      errors.push(
        accepted.length === 1
          ? lastFailure
          : `${failed} of ${accepted.length} uploads failed (${lastFailure})`
      );
      setError(errors.join(" · "));
    }
  }

  const batchLabel = batch ? ` ${batch.index}/${batch.total}` : "";

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
      <input
        ref={inputRef}
        type="file"
        accept={accept || "image/*"}
        multiple={multiple}
        onChange={handleFiles}
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
          background: "#ede9fe",
          color: "#5b21b6",
          cursor: "pointer",
          whiteSpace: "nowrap",
          ...(buttonStyle || {}),
          // Uploading feedback always wins over any style override.
          ...(uploading
            ? { background: "#e4e4e7", color: "#a1a1aa", cursor: "wait" }
            : {}),
        }}
      >
        {uploading
          ? progress > 0
            ? `Uploading${batchLabel} · ${progress}%`
            : `Uploading${batchLabel}...`
          : label || "Upload"}
      </button>
      {error && (
        <span style={{ fontSize: 10, color: "#dc2626" }}>{error}</span>
      )}
    </span>
  );
}
