"use client";

import { useState, useCallback, useEffect } from "react";

type Client = { id: string; name: string; igHandle: string };

type Comment = {
  id: string;
  username: string;
  text: string;
  timestamp: string;
  likeCount: number;
  postId: string;
  postUrl: string;
  label: string | null;
  locationTags: string[];
  keywordMatches: string[];
};

type FilterLabel = "Question" | "Complaint" | "Recommendation" | "__location" | null;

const LABEL_STYLE: Record<string, { bg: string; color: string; border: string }> = {
  Question:       { bg: "#dbeafe", color: "#1d4ed8", border: "#bfdbfe" },
  Complaint:      { bg: "#fee2e2", color: "#dc2626", border: "#fca5a5" },
  Recommendation: { bg: "#dcfce7", color: "#16a34a", border: "#86efac" },
};

function highlightKeywords(text: string, keywords: string[]) {
  if (!keywords.length) return text;
  const escaped = keywords.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = new RegExp(`(${escaped.join("|")})`, "gi");
  const parts = text.split(pattern);
  return parts.map((part, i) =>
    keywords.some((k) => k.toLowerCase() === part.toLowerCase()) ? (
      <mark key={i} style={{ background: "#fef08a", borderRadius: 2, padding: "0 1px" }}>
        {part}
      </mark>
    ) : (
      part
    )
  );
}

function formatTime(ts: string): string {
  if (!ts) return "";
  try {
    const d = new Date(ts);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString("en-GB", {
      day: "numeric", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export default function InteractionsPanel({ clients }: { clients: Client[] }) {
  const [selectedClientId, setSelectedClientId] = useState(clients[0]?.id ?? "");
  const [handle, setHandle] = useState(clients[0]?.igHandle ?? "");

  // Auto-fill handle when client changes
  useEffect(() => {
    const client = clients.find((c) => c.id === selectedClientId);
    if (client?.igHandle) setHandle(client.igHandle);
  }, [selectedClientId, clients]);
  const [limit, setLimit] = useState(50);
  const [loading, setLoading] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [keywords, setKeywords] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSetupError, setIsSetupError] = useState(false);
  const [filterLabel, setFilterLabel] = useState<FilterLabel>(null);

  const fetchComments = useCallback(async () => {
    if (!handle.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        handle: handle.trim().replace(/^@/, ""),
        limit: String(limit),
      });
      if (selectedClientId) params.set("clientId", selectedClientId);
      const res = await fetch(`/api/interactions?${params}`);
      const d = await res.json();
      if (d.ok) {
        setComments(d.comments ?? []);
        setKeywords(d.keywords ?? []);
        setIsSetupError(false);
      } else {
        setError(d.error ?? "Failed to fetch comments");
        setIsSetupError(!!d.setup);
      }
    } catch {
      setError("Network error — could not reach the server.");
    } finally {
      setLoading(false);
    }
  }, [handle, limit, selectedClientId]);

  const filtered =
    filterLabel === "__location"
      ? comments.filter((c) => c.locationTags.length > 0)
      : filterLabel
      ? comments.filter((c) => c.label === filterLabel)
      : comments;

  const stats = {
    total: comments.length,
    questions: comments.filter((c) => c.label === "Question").length,
    complaints: comments.filter((c) => c.label === "Complaint").length,
    recommendations: comments.filter((c) => c.label === "Recommendation").length,
    onIsland: comments.filter((c) => c.locationTags.length > 0).length,
  };

  function toggleFilter(label: FilterLabel) {
    setFilterLabel((f) => (f === label ? null : label));
  }

  const inputStyle: React.CSSProperties = {
    padding: "7px 10px",
    borderRadius: 8,
    border: "1px solid #e4e4e7",
    fontSize: 13,
    color: "#18181b",
    background: "#fff",
    outline: "none",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 600,
    color: "#52525b",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    marginBottom: 4,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Page header */}
      <div>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#18181b" }}>Interactions</h1>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: "#71717a" }}>
          Live Instagram comment feed — auto-labelled and keyword highlighted.
        </p>
      </div>

      {/* Controls card */}
      <div style={{
        background: "#fff", border: "1px solid #e4e4e7", borderRadius: 12,
        padding: "16px 20px", display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end",
      }}>
        {/* Client */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span style={labelStyle}>Client</span>
          <select
            value={selectedClientId}
            onChange={(e) => setSelectedClientId(e.target.value)}
            style={{ ...inputStyle, minWidth: 160 }}
          >
            {clients.length === 0 && <option value="">No clients</option>}
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        {/* Handle */}
        <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 170 }}>
          <span style={labelStyle}>Instagram Handle</span>
          <input
            type="text"
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && fetchComments()}
            placeholder="@handle"
            style={{ ...inputStyle, width: "100%" }}
          />
        </div>

        {/* Limit */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span style={labelStyle}>Limit</span>
          <select
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            style={inputStyle}
          >
            <option value={20}>20</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </div>

        <button
          type="button"
          onClick={fetchComments}
          disabled={loading || !handle.trim()}
          style={{
            padding: "8px 22px", borderRadius: 8, border: "none",
            background: loading || !handle.trim() ? "#a1a1aa" : "#18181b",
            color: "#fff", fontSize: 13, fontWeight: 600,
            cursor: loading || !handle.trim() ? "not-allowed" : "pointer",
            flexShrink: 0,
          }}
        >
          {loading ? "Loading…" : "Fetch"}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div style={{
          background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 10, padding: "14px 18px",
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#dc2626", marginBottom: 4 }}>
            ● Instagram source error
          </div>
          <div style={{ fontSize: 12, color: "#7f1d1d" }}>{error}</div>
          {isSetupError && (
            <div style={{ marginTop: 10, fontSize: 12, color: "#991b1b", lineHeight: 1.6 }}>
              <strong>To fix:</strong> Add these to your Vercel environment variables:
              <br /><code>INTERACTION_IG_SOURCE_URL</code> — your Apify or proxy endpoint
              <br /><code>INTERACTION_IG_SOURCE_AUTH_HEADER</code> — e.g. <code>Bearer your-token</code>
              <br /><code>INTERACTION_IG_KEYWORDS</code> — comma-separated keywords to highlight
            </div>
          )}
        </div>
      )}

      {/* Stat pills / filters */}
      {comments.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {[
            { key: null,              label: "All",             value: stats.total,           color: "#18181b" },
            { key: "Question",        label: "Questions",       value: stats.questions,       color: "#1d4ed8" },
            { key: "Complaint",       label: "Complaints",      value: stats.complaints,      color: "#dc2626" },
            { key: "Recommendation",  label: "Recommendations", value: stats.recommendations, color: "#16a34a" },
            { key: "__location",      label: "📍 On-island",   value: stats.onIsland,        color: "#b45309" },
          ].map(({ key, label, value, color }) => {
            const active = filterLabel === key;
            return (
              <button
                key={label}
                type="button"
                onClick={() => toggleFilter(key as FilterLabel)}
                style={{
                  padding: "8px 16px", borderRadius: 8, cursor: "pointer",
                  border: `1px solid ${active ? color : "#e4e4e7"}`,
                  background: active ? "#f8fafc" : "#fff",
                  textAlign: "left", transition: "all 0.1s",
                }}
              >
                <div style={{ fontSize: 18, fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
                <div style={{ fontSize: 11, color: "#71717a", marginTop: 2 }}>{label}</div>
              </button>
            );
          })}
        </div>
      )}

      {/* Comment feed */}
      {filtered.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.map((comment) => (
            <CommentCard key={comment.id} comment={comment} keywords={keywords} />
          ))}
        </div>
      )}

      {/* Empty states */}
      {!loading && !error && comments.length === 0 && handle.trim() && (
        <div style={{ textAlign: "center", padding: "32px 0", fontSize: 13, color: "#94a3b8" }}>
          No comments loaded — click Fetch to pull the latest.
        </div>
      )}
      {!handle.trim() && !error && (
        <div style={{ textAlign: "center", padding: "32px 0", fontSize: 13, color: "#94a3b8" }}>
          Enter an Instagram handle above to load comments.
        </div>
      )}
    </div>
  );
}

function CommentCard({ comment, keywords }: { comment: Comment; keywords: string[] }) {
  const labelStyle = comment.label ? LABEL_STYLE[comment.label] : null;
  const hasLocation = comment.locationTags.length > 0;

  return (
    <div style={{
      background: "#fff",
      border: `1px solid ${hasLocation ? "#fde68a" : "#e4e4e7"}`,
      borderRadius: 10,
      padding: "14px 16px",
      display: "flex",
      flexDirection: "column",
      gap: 8,
    }}>
      {/* Username + timestamp */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#18181b" }}>
            @{comment.username}
          </span>
          {comment.timestamp && (
            <span style={{ fontSize: 11, color: "#a1a1aa" }}>{formatTime(comment.timestamp)}</span>
          )}
        </div>
        {comment.likeCount > 0 && (
          <span style={{ fontSize: 12, color: "#71717a", flexShrink: 0 }}>❤️ {comment.likeCount}</span>
        )}
      </div>

      {/* Comment text with keyword highlights */}
      <div style={{ fontSize: 13, color: "#27272a", lineHeight: 1.55 }}>
        {keywords.length ? highlightKeywords(comment.text, keywords) : comment.text}
      </div>

      {/* Badges row */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        {labelStyle && comment.label && (
          <span style={{
            padding: "2px 9px", borderRadius: 99, fontSize: 11, fontWeight: 700,
            background: labelStyle.bg, color: labelStyle.color, border: `1px solid ${labelStyle.border}`,
          }}>
            {comment.label}
          </span>
        )}

        {comment.locationTags.map((loc) => (
          <span key={loc} style={{
            padding: "2px 9px", borderRadius: 99, fontSize: 11, fontWeight: 600,
            background: "#fef3c7", color: "#92400e", border: "1px solid #fde68a",
          }}>
            📍 {loc}
          </span>
        ))}

        {hasLocation && (
          <span style={{
            padding: "2px 10px", borderRadius: 99, fontSize: 11, fontWeight: 700,
            background: "#fff7ed", color: "#c2410c", border: "1px solid #fed7aa",
          }}>
            👉 Boost posts on-island now
          </span>
        )}

        {comment.postUrl && (
          <a
            href={comment.postUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: 11, color: "#6366f1", textDecoration: "none", marginLeft: "auto" }}
          >
            View post ↗
          </a>
        )}
      </div>
    </div>
  );
}
