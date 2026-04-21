"use client";

import { useEffect, useState } from "react";

type ClientImage = { id: string; publicUrl: string; table: "site" | "upload" };

export default function ClientPhotoLibrary({ clientId }: { clientId: string }) {
  const [images, setImages] = useState<ClientImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanMsg, setScanMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/client-images?clientId=${encodeURIComponent(clientId)}`)
      .then((r) => r.json())
      .then((d) => { if (d.ok) setImages(d.images); })
      .finally(() => setLoading(false));
  }, [clientId]);

  async function handleUpload(files: FileList | null) {
    if (!files || uploading) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.append("file", file);
        form.append("clientId", clientId);
        const res = await fetch("/api/client-images/upload", { method: "POST", body: form });
        const d = await res.json();
        if (d.ok) setImages((prev) => [d.image, ...prev]);
      }
    } finally {
      setUploading(false);
    }
  }

  async function handleScan() {
    if (scanning) return;
    setScanning(true);
    setScanMsg(null);
    try {
      const res = await fetch("/api/client-images/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId }),
      });
      const d = await res.json();
      if (d.ok) {
        if (d.added > 0) {
          setImages((prev) => {
            const ids = new Set(prev.map((i) => i.id));
            return [...d.images.filter((i: ClientImage) => !ids.has(i.id)), ...prev];
          });
          setScanMsg(`Found ${d.added} new image${d.added !== 1 ? "s" : ""}`);
        } else {
          setScanMsg("No new images found");
        }
      } else {
        setScanMsg(d.error ?? "Scan failed");
      }
    } catch {
      setScanMsg("Network error");
    } finally {
      setScanning(false);
    }
  }

  async function handleDelete(img: ClientImage) {
    await fetch(`/api/client-images?id=${encodeURIComponent(img.id)}&table=${img.table}`, { method: "DELETE" });
    setImages((prev) => prev.filter((i) => i.id !== img.id));
  }

  const isError = scanMsg && (scanMsg.includes("failed") || scanMsg.includes("No website") || scanMsg.includes("error") || scanMsg.includes("Error"));

  return (
    <div style={{
      background: "#fff",
      border: "1px solid #e4e4e7",
      borderRadius: 14,
      padding: "20px 24px",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#18181b" }}>Photo library</div>
          <div style={{ fontSize: 12, color: "#71717a", marginTop: 2 }}>
            Upload client photos or scan their website. These appear in the proofer 📁 Library.
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {/* Upload files */}
          <label style={{
            padding: "7px 14px", borderRadius: 8,
            border: "1px solid #bae6fd", background: "#e0f2fe",
            color: "#0369a1", fontSize: 12, fontWeight: 600,
            cursor: uploading ? "wait" : "pointer",
          }}>
            {uploading ? "Uploading…" : "+ Upload photos"}
            <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple style={{ display: "none" }}
              onChange={(e) => { handleUpload(e.target.files); e.target.value = ""; }}
            />
          </label>

          {/* Upload folder */}
          <label style={{
            padding: "7px 14px", borderRadius: 8,
            border: "1px solid #bae6fd", background: "#e0f2fe",
            color: "#0369a1", fontSize: 12, fontWeight: 600,
            cursor: uploading ? "wait" : "pointer",
          }} title="Upload an entire folder of photos">
            📁 Upload folder
            {/* @ts-expect-error webkitdirectory is non-standard */}
            <input type="file" accept="image/*" multiple webkitdirectory="" style={{ display: "none" }}
              onChange={(e) => { handleUpload(e.target.files); e.target.value = ""; }}
            />
          </label>

          {/* Scan website */}
          <button
            type="button"
            onClick={handleScan}
            disabled={scanning}
            style={{
              padding: "7px 14px", borderRadius: 8,
              border: "1px solid #d1fae5", background: "#ecfdf5",
              color: "#065f46", fontSize: 12, fontWeight: 600,
              cursor: scanning ? "wait" : "pointer",
            }}
          >
            {scanning ? "Scanning…" : images.length > 0 ? "🔍 Scan for more" : "🔍 Scan website"}
          </button>
        </div>
      </div>

      {scanMsg && (
        <div style={{ fontSize: 12, marginBottom: 12, color: isError ? "#991b1b" : "#065f46", fontWeight: 500 }}>
          {scanMsg}
        </div>
      )}

      {loading ? (
        <div style={{ fontSize: 13, color: "#94a3b8", padding: "16px 0" }}>Loading…</div>
      ) : images.length === 0 ? (
        <div style={{ fontSize: 13, color: "#94a3b8", padding: "16px 0" }}>
          No photos yet — upload some or click "Scan website" to pull images from the client's website.
        </div>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {images.map((img) => (
            <div key={img.id} style={{ position: "relative", flexShrink: 0 }}>
              <img
                src={img.publicUrl}
                alt=""
                style={{ width: 140, height: 95, objectFit: "cover", borderRadius: 8, display: "block", border: "1px solid #e4e4e7" }}
              />
              <div style={{
                position: "absolute", bottom: 4, left: 4,
                fontSize: 9, fontWeight: 700, color: "#fff",
                background: "rgba(0,0,0,0.45)", borderRadius: 3, padding: "1px 4px",
              }}>
                {img.table === "upload" ? "uploaded" : "website"}
              </div>
              <button
                type="button"
                onClick={() => handleDelete(img)}
                style={{
                  position: "absolute", top: 4, right: 4,
                  width: 20, height: 20, borderRadius: "50%",
                  border: "none", background: "rgba(0,0,0,0.55)",
                  color: "#fff", fontSize: 12, lineHeight: "20px",
                  textAlign: "center", cursor: "pointer", padding: 0,
                }}
                title="Remove from library"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
