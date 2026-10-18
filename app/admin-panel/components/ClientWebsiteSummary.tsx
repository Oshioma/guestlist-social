"use client";

import { useEffect, useState } from "react";
import { readDraft, writeDraft, clearDraft } from "@/lib/draft-storage";

type Props = {
  clientId: string;
  initialWebsiteUrl: string;
  initialSummary: string;
  initialReadAt: string | null;
};

type Draft = { websiteUrl: string; summary: string };

function formatReadAt(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function ClientWebsiteSummary({
  clientId,
  initialWebsiteUrl,
  initialSummary,
  initialReadAt,
}: Props) {
  const draftKey = `client-website-summary:${clientId}`;
  const [websiteUrl, setWebsiteUrl] = useState(initialWebsiteUrl);
  const [summary, setSummary] = useState(initialSummary);
  const [savedSummary, setSavedSummary] = useState(initialSummary);
  const [readAt, setReadAt] = useState(initialReadAt);
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);

  // Restore an unsaved draft after a refresh.
  useEffect(() => {
    const d = readDraft<Draft>(draftKey);
    if (d && (d.summary !== initialSummary || d.websiteUrl !== initialWebsiteUrl)) {
      setWebsiteUrl(d.websiteUrl);
      setSummary(d.summary);
      setStatus("Restored your unsaved changes.");
    }
    setRestored(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey]);

  // Auto-save the draft while typing; drop it once it matches what's saved.
  useEffect(() => {
    if (!restored) return;
    if (summary === savedSummary && websiteUrl === initialWebsiteUrl) clearDraft(draftKey);
    else writeDraft<Draft>(draftKey, { websiteUrl, summary });
  }, [restored, draftKey, websiteUrl, summary, savedSummary, initialWebsiteUrl]);

  const dirty = summary !== savedSummary;

  async function handleRead() {
    setReading(true);
    setError(null);
    setStatus(null);
    try {
      const res = await fetch("/api/client-website-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, websiteUrl }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error ?? "Couldn't read the website.");
        return;
      }
      setWebsiteUrl(data.websiteUrl);
      setSummary(data.summary);
      setSavedSummary(data.summary);
      setReadAt(data.readAt);
      clearDraft(draftKey);
      const n = Array.isArray(data.pagesRead) ? data.pagesRead.length : 0;
      setStatus(`Read ${n} page${n === 1 ? "" : "s"} and saved the summary.`);
    } catch {
      setError("Network error — please try again.");
    } finally {
      setReading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    setStatus(null);
    try {
      const res = await fetch("/api/client-website-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, summary }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error ?? "Couldn't save.");
        return;
      }
      setSavedSummary(data.summary);
      setSummary(data.summary);
      clearDraft(draftKey);
      setStatus("Saved");
    } catch {
      setError("Network error — please try again.");
    } finally {
      setSaving(false);
    }
  }

  const readAtLabel = formatReadAt(readAt);

  return (
    <div
      style={{
        maxWidth: 720,
        background: "#fff",
        border: "1px solid #e4e4e7",
        borderRadius: 16,
        padding: 24,
      }}
    >
      <div style={{ marginBottom: 12 }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#18181b" }}>
          Website brand summary
        </h2>
        <p style={{ margin: "4px 0 0", fontSize: 12, color: "#71717a" }}>
          The AI reads the website and writes a brief of what the business sells, who it&apos;s for
          and how it talks. Post ideas and caption rewrites use it. Read it again whenever the site
          changes.
        </p>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <input
          type="url"
          value={websiteUrl}
          onChange={(e) => setWebsiteUrl(e.target.value)}
          placeholder="https://www.example.co.uk"
          style={{
            flex: "1 1 260px",
            minWidth: 0,
            padding: "8px 12px",
            borderRadius: 8,
            border: "1px solid #e4e4e7",
            fontSize: 14,
            fontFamily: "inherit",
            color: "#18181b",
            background: "#fafafa",
          }}
        />
        <button
          type="button"
          onClick={handleRead}
          disabled={reading || !websiteUrl.trim()}
          style={{
            padding: "8px 14px",
            borderRadius: 8,
            border: "none",
            background: reading || !websiteUrl.trim()
              ? "#c7d2fe"
              : "linear-gradient(135deg, #4338ca 0%, #7c3aed 100%)",
            color: "#fff",
            fontSize: 13,
            fontWeight: 700,
            cursor: reading ? "wait" : websiteUrl.trim() ? "pointer" : "not-allowed",
          }}
        >
          {reading ? "Reading website…" : summary ? "★ Read again" : "★ Read website"}
        </button>
      </div>

      <textarea
        value={summary}
        onChange={(e) => { setSummary(e.target.value); setStatus(null); }}
        placeholder="No summary yet. Add the website address above and click Read website. You can edit the summary afterwards."
        style={{
          width: "100%",
          minHeight: 220,
          padding: "12px 14px",
          borderRadius: 12,
          border: "1px solid #e4e4e7",
          fontSize: 14,
          fontFamily: "inherit",
          color: "#18181b",
          background: "#fafafa",
          resize: "vertical",
          boxSizing: "border-box",
          lineHeight: 1.6,
        }}
      />

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
        {dirty && (
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: "8px 16px",
              borderRadius: 8,
              border: "none",
              background: saving ? "#d4d4d8" : "#18181b",
              color: saving ? "#a1a1aa" : "#fff",
              fontSize: 13,
              fontWeight: 600,
              cursor: saving ? "wait" : "pointer",
            }}
          >
            {saving ? "Saving..." : "Save summary"}
          </button>
        )}
        {error && <span style={{ fontSize: 12, color: "#991b1b" }}>{error}</span>}
        {status && !error && <span style={{ fontSize: 12, color: "#166534" }}>{status}</span>}
        {readAtLabel && (
          <span style={{ fontSize: 12, color: "#a1a1aa", marginLeft: "auto" }}>
            Last updated {readAtLabel}
          </span>
        )}
      </div>
    </div>
  );
}
