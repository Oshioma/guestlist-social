"use client";

import { useRef, useState } from "react";

type Props = {
  folder: string;
  onUploaded: (url: string) => void;
  label?: string;
  compact?: boolean;
  bucket?: string;
};

export default function ImageUpload({ folder, onUploaded, label, compact, bucket }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    setUploading(true);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("folder", folder);
    if (bucket) formData.append("bucket", bucket);

    try {
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Upload failed");
      } else {
        onUploaded(data.url);
      }
    } catch {
      setError("Upload failed");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
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
        {uploading ? "Uploading..." : label || "Upload"}
      </button>
      {error && (
        <span style={{ fontSize: 10, color: "#dc2626" }}>{error}</span>
      )}
    </span>
  );
}
