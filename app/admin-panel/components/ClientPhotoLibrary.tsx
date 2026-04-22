"use client";

import { useEffect, useState } from "react";

type ClientImage = { id: string; publicUrl: string; table: "site" | "upload" };

export default function ClientPhotoLibrary({ clientId }: { clientId: string }) {
  const [images, setImages] = useState<ClientImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanMsg, setScanMsg] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [driveOpen, setDriveOpen] = useState(false);
  const [driveUrl, setDriveUrl] = useState("");
  const [driveLoading, setDriveLoading] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("photoLibrary_collapsed") === "true";
  });

  function toggleCollapsed() {
    setCollapsed((c) => {
      const next = !c;
      localStorage.setItem("photoLibrary_collapsed", String(next));
      return next;
    });
  }

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

  async function handleDeleteLastScan() {
    if (!deleteConfirm) {
      setDeleteConfirm(true);
      // Auto-reset confirm state after 5 seconds if not clicked
      setTimeout(() => setDeleteConfirm(false), 5000);
      return;
    }
    setDeleting(true);
    setDeleteConfirm(false);
    setScanMsg(null);
    try {
      const res = await fetch("/api/client-images/last-scan", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId }),
      });
      const d = await res.json();
      if (d.ok) {
        setScanMsg(d.deleted > 0 ? `Removed ${d.deleted} image${d.deleted !== 1 ? "s" : ""} from last scan` : "Nothing to delete");
        // Reload the image list
        const r = await fetch(`/api/client-images?clientId=${encodeURIComponent(clientId)}`);
        const data = await r.json();
        if (data.ok) setImages(data.images);
      } else {
        setScanMsg(d.error ?? "Delete failed");
      }
    } catch {
      setScanMsg("Network error");
    } finally {
      setDeleting(false);
    }
  }

  async function handleDriveImport() {
    if (!driveUrl.trim() || driveLoading) return;
    setDriveLoading(true);
    setScanMsg(null);
    try {
      const res = await fetch("/api/client-images/drive-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, folderUrl: driveUrl.trim() }),
      });
      const d = await res.json();
      if (d.ok) {
        if (d.added > 0) {
          setImages((prev) => {
            const ids = new Set(prev.map((i) => i.id));
            return [...d.images.filter((i: ClientImage) => !ids.has(i.id)), ...prev];
          });
          const extras = [
            d.skipped > 0 ? `${d.skipped} already in library` : null,
            d.oversized > 0 ? `${d.oversized} over 80 MB skipped` : null,
          ].filter(Boolean).join(", ");
          setScanMsg(`Imported ${d.added} item${d.added !== 1 ? "s" : ""} from Drive${extras ? ` (${extras})` : ""}`);
        } else {
          setScanMsg(d.skipped > 0 ? "All photos already in library" : "No images found in that folder");
        }
        setDriveUrl("");
        setDriveOpen(false);
      } else {
        setScanMsg(d.error ?? "Import failed");
      }
    } catch {
      setScanMsg("Network error");
    } finally {
      setDriveLoading(false);
    }
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
        <div style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }} onClick={toggleCollapsed}>
          <span style={{ fontSize: 13, color: "#a1a1aa", userSelect: "none" }}>{collapsed ? "▶" : "▼"}</span>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#18181b" }}>Photo library</div>
            {collapsed && (
              <div style={{ fontSize: 12, color: "#71717a", marginTop: 2 }}>
                {images.length} photo{images.length !== 1 ? "s" : ""}
              </div>
            )}
            {!collapsed && (
              <div style={{ fontSize: 12, color: "#71717a", marginTop: 2 }}>
                Upload client photos or scan their website. These appear in the proofer 📁 Library.
              </div>
            )}
          </div>
        </div>

        {!collapsed && <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
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

          {/* Google Drive folder import */}
          <button
            type="button"
            onClick={() => { setDriveOpen((o) => !o); setScanMsg(null); }}
            style={{
              padding: "7px 14px", borderRadius: 8,
              border: `1px solid ${driveOpen ? "#c4b5fd" : "#bae6fd"}`,
              background: driveOpen ? "#ede9fe" : "#e0f2fe",
              color: driveOpen ? "#5b21b6" : "#0369a1",
              fontSize: 12, fontWeight: 600, cursor: "pointer",
            }}
            title="Import all images from a shared Google Drive folder"
          >
            ☁️ Drive folder
          </button>

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

          {/* Delete last scan batch */}
          {images.some((i) => i.table === "site") && (
            <button
              type="button"
              onClick={handleDeleteLastScan}
              disabled={deleting}
              style={{
                padding: "7px 14px", borderRadius: 8,
                border: `1px solid ${deleteConfirm ? "#fca5a5" : "#e4e4e7"}`,
                background: deleteConfirm ? "#fef2f2" : "#fafafa",
                color: deleteConfirm ? "#991b1b" : "#71717a",
                fontSize: 12, fontWeight: 600,
                cursor: deleting ? "wait" : "pointer",
                transition: "all 0.15s",
              }}
              title="Delete all images from the most recent scan (click twice to confirm)"
            >
              {deleting ? "Deleting…" : deleteConfirm ? "⚠️ Confirm delete?" : "🗑 Delete last scan"}
            </button>
          )}
        </div>}
      </div>

      {!collapsed && driveOpen && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
          <input
            type="url"
            value={driveUrl}
            onChange={(e) => setDriveUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleDriveImport(); }}
            placeholder="Paste Google Drive folder link…"
            autoFocus
            style={{
              flex: 1, minWidth: 260,
              padding: "7px 12px", borderRadius: 8,
              border: "1px solid #c4b5fd", background: "#faf5ff",
              fontSize: 12, color: "#18181b", outline: "none",
            }}
          />
          <button
            type="button"
            onClick={handleDriveImport}
            disabled={driveLoading || !driveUrl.trim()}
            style={{
              padding: "7px 16px", borderRadius: 8,
              border: "none", background: driveLoading ? "#a78bfa" : "#7c3aed",
              color: "#fff", fontSize: 12, fontWeight: 700,
              cursor: driveLoading || !driveUrl.trim() ? "wait" : "pointer",
              flexShrink: 0,
            }}
          >
            {driveLoading ? "Importing…" : "Import"}
          </button>
          <span style={{ fontSize: 11, color: "#78716c" }}>
            Folder must be shared as "Anyone with the link can view"
          </span>
        </div>
      )}

      {!collapsed && scanMsg && (
        <div style={{ fontSize: 12, marginBottom: 12, color: isError ? "#991b1b" : "#065f46", fontWeight: 500 }}>
          {scanMsg}
        </div>
      )}

      {!collapsed && (loading ? (
        <div style={{ fontSize: 13, color: "#94a3b8", padding: "16px 0" }}>Loading…</div>
      ) : images.length === 0 ? (
        <div style={{ fontSize: 13, color: "#94a3b8", padding: "16px 0" }}>
          No photos yet — upload some or click "Scan website" to pull images from the client's website.
        </div>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {images.map((img) => (
            <div key={img.id} style={{ position: "relative", flexShrink: 0 }}>
              {img.publicUrl.includes("drive.google.com/uc") ? (() => {
                const m = img.publicUrl.match(/[?&]id=([a-zA-Z0-9_-]+)/);
                const thumbUrl = m ? `https://drive.google.com/thumbnail?id=${m[1]}&sz=w400` : null;
                return (
                  <div style={{ position: "relative", width: 140, height: 95, flexShrink: 0 }}>
                    {thumbUrl ? (
                      <img src={thumbUrl} alt="" style={{ width: 140, height: 95, objectFit: "cover", borderRadius: 8, display: "block", border: "1px solid #e4e4e7" }} />
                    ) : (
                      <div style={{ width: 140, height: 95, borderRadius: 8, background: "#18181b", border: "1px solid #e4e4e7" }} />
                    )}
                    <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8, background: "rgba(0,0,0,0.25)" }}>
                      <span style={{ fontSize: 26, color: "#fff", lineHeight: 1 }}>▶</span>
                    </div>
                  </div>
                );
              })() : (
                <img
                  src={img.publicUrl}
                  alt=""
                  style={{ width: 140, height: 95, objectFit: "cover", borderRadius: 8, display: "block", border: "1px solid #e4e4e7" }}
                />
              )}
              <div style={{
                position: "absolute", bottom: 4, left: 4,
                fontSize: 9, fontWeight: 700, color: "#fff",
                background: "rgba(0,0,0,0.45)", borderRadius: 3, padding: "1px 4px",
              }}>
                {img.publicUrl.includes("drive.google.com/uc")
                  ? "🎥 drive"
                  : img.table === "upload"
                  ? "uploaded"
                  : img.publicUrl.includes("lh3.googleusercontent.com")
                  ? "drive"
                  : "website"}
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
      ))}
    </div>
  );
}
