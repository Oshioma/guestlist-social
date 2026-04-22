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
  platform: "facebook" | "instagram";
  label: string | null;
  locationTags: string[];
  keywordMatches: string[];
};

type PlatformFilter = "both" | "facebook" | "instagram";
type LabelFilter = "Question" | "Complaint" | "Recommendation" | "__location" | null;

const LABEL_STYLE: Record<string, { bg: string; color: string; border: string }> = {
  Question:       { bg: "#dbeafe", color: "#1d4ed8", border: "#bfdbfe" },
  Complaint:      { bg: "#fee2e2", color: "#dc2626", border: "#fca5a5" },
  Recommendation: { bg: "#dcfce7", color: "#16a34a", border: "#86efac" },
};

const PLATFORM_ICON: Record<string, string> = {
  facebook:  "f",
  instagram: "ig",
};

const PLATFORM_COLOR: Record<string, string> = {
  facebook:  "#1877f2",
  instagram: "#e1306c",
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
  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>("both");
  const [limit, setLimit] = useState(50);
  const [loading, setLoading] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [keywords, setKeywords] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [noAccounts, setNoAccounts] = useState(false);
  const [labelFilter, setLabelFilter] = useState<LabelFilter>(null);

  const fetchComments = useCallback(async () => {
    if (!selectedClientId) return;
    setLoading(true);
    setError(null);
    setNoAccounts(false);
    setWarnings([]);
    try {
      const params = new URLSearchParams({
        clientId: selectedClientId,
        platform: platformFilter,
        limit: String(limit),
      });
      const res = await fetch(`/api/interactions?${params}`);
      const d = await res.json();
      if (d.ok) {
        setComments(d.comments ?? []);
        setKeywords(d.keywords ?? []);
        setWarnings(d.warnings ?? []);
      } else {
        setError(d.error ?? "Failed to fetch comments");
        setNoAccounts(!!d.noAccounts);
      }
    } catch {
      setError("Network error — could not reach the server.");
    } finally {
      setLoading(false);
    }
  }, [selectedClientId, platformFilter, limit]);

  // Auto-fetch when client or platform changes (if we already loaded once)
  useEffect(() => {
    if (comments.length > 0) fetchComments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClientId, platformFilter]);

  const filtered =
    labelFilter === "__location"
      ? comments.filter((c) => c.locationTags.length > 0)
      : labelFilter
      ? comments.filter((c) => c.label === labelFilter)
      : comments;

  const stats = {
    total: comments.length,
    facebook:        comments.filter((c) => c.platform === "facebook").length,
    instagram:       comments.filter((c) => c.platform === "instagram").length,
    questions:       comments.filter((c) => c.label === "Question").length,
    complaints:      comments.filter((c) => c.label === "Complaint").length,
    recommendations: comments.filter((c) => c.label === "Recommendation").length,
    onIsland:        comments.filter((c) => c.locationTags.length > 0).length,
  };

  function toggleLabel(label: LabelFilter) {
    setLabelFilter((f) => (f === label ? null : label));
  }

  const inputStyle: React.CSSProperties = {
    padding: "7px 10px", borderRadius: 8, border: "1px solid #e4e4e7",
    fontSize: 13, color: "#18181b", background: "#fff", outline: "none",
  };
  const capStyle: React.CSSProperties = {
    fontSize: 11, fontWeight: 600, color: "#52525b",
    textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#18181b" }}>Interactions</h1>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: "#71717a" }}>
          Live Facebook &amp; Instagram comment feed — auto-labelled and keyword highlighted.
        </p>
      </div>

      {/* Controls */}
      <div style={{
        background: "#fff", border: "1px solid #e4e4e7", borderRadius: 12,
        padding: "16px 20px", display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end",
      }}>
        {/* Client */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span style={capStyle}>Client</span>
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

        {/* Platform */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span style={capStyle}>Platform</span>
          <div style={{ display: "flex", borderRadius: 8, border: "1px solid #e4e4e7", overflow: "hidden", background: "#f4f4f5" }}>
            {(["both", "facebook", "instagram"] as PlatformFilter[]).map((p) => {
              const active = platformFilter === p;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPlatformFilter(p)}
                  style={{
                    padding: "7px 14px", border: "none", fontSize: 12, fontWeight: active ? 700 : 500,
                    background: active ? "#18181b" : "transparent",
                    color: active ? "#fff" : "#71717a", cursor: "pointer", transition: "all 0.1s",
                  }}
                >
                  {p === "both" ? "All" : p === "facebook" ? "Facebook" : "Instagram"}
                </button>
              );
            })}
          </div>
        </div>

        {/* Limit */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span style={capStyle}>Limit</span>
          <select value={limit} onChange={(e) => setLimit(Number(e.target.value))} style={inputStyle}>
            <option value={20}>20</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </div>

        <button
          type="button"
          onClick={fetchComments}
          disabled={loading || !selectedClientId}
          style={{
            padding: "8px 22px", borderRadius: 8, border: "none",
            background: loading ? "#a1a1aa" : "#18181b",
            color: "#fff", fontSize: 13, fontWeight: 600,
            cursor: loading ? "wait" : "pointer", flexShrink: 0,
          }}
        >
          {loading ? "Loading…" : comments.length > 0 ? "Refresh" : "Load comments"}
        </button>
      </div>

      {/* Error / no accounts */}
      {error && (
        <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 10, padding: "14px 18px" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#dc2626", marginBottom: 4 }}>
            {noAccounts ? "No connected account" : "● Error"}
          </div>
          <div style={{ fontSize: 12, color: "#7f1d1d" }}>{error}</div>
          {noAccounts && (
            <div style={{ marginTop: 8, fontSize: 12, color: "#991b1b" }}>
              Go to <strong>Clients → [this client] → Connect accounts</strong> to link their Facebook Page or Instagram account.
            </div>
          )}
        </div>
      )}

      {/* Partial warnings */}
      {warnings.length > 0 && (
        <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10, padding: "10px 14px" }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#92400e" }}>Partial results — some accounts had errors:</div>
          {warnings.map((w, i) => <div key={i} style={{ fontSize: 12, color: "#78350f", marginTop: 2 }}>{w}</div>)}
        </div>
      )}

      {/* Stats / filter pills */}
      {comments.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {[
            { key: null,             label: "All",             value: stats.total,           color: "#18181b" },
            { key: "Question",       label: "Questions",       value: stats.questions,       color: "#1d4ed8" },
            { key: "Complaint",      label: "Complaints",      value: stats.complaints,      color: "#dc2626" },
            { key: "Recommendation", label: "Recommendations", value: stats.recommendations, color: "#16a34a" },
            { key: "__location",     label: "📍 On-island",   value: stats.onIsland,        color: "#b45309" },
          ].map(({ key, label, value, color }) => {
            const active = labelFilter === key;
            return (
              <button
                key={label}
                type="button"
                onClick={() => toggleLabel(key as LabelFilter)}
                style={{
                  padding: "8px 16px", borderRadius: 8, cursor: "pointer", textAlign: "left",
                  border: `1px solid ${active ? color : "#e4e4e7"}`,
                  background: active ? "#f8fafc" : "#fff", transition: "all 0.1s",
                }}
              >
                <div style={{ fontSize: 18, fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
                <div style={{ fontSize: 11, color: "#71717a", marginTop: 2 }}>{label}</div>
              </button>
            );
          })}

          {/* Platform breakdown */}
          {stats.facebook > 0 && stats.instagram > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: 8, fontSize: 12, color: "#71717a" }}>
              <span style={{ color: PLATFORM_COLOR.facebook, fontWeight: 600 }}>f {stats.facebook}</span>
              <span style={{ color: PLATFORM_COLOR.instagram, fontWeight: 600 }}>ig {stats.instagram}</span>
            </div>
          )}
        </div>
      )}

      {/* Feed */}
      {filtered.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.map((comment) => (
            <CommentCard key={`${comment.platform}-${comment.id}`} comment={comment} keywords={keywords} />
          ))}
        </div>
      )}

      {!loading && !error && comments.length === 0 && (
        <div style={{ textAlign: "center", padding: "32px 0", fontSize: 13, color: "#94a3b8" }}>
          Select a client and click Load comments.
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
      borderRadius: 10, padding: "14px 16px",
      display: "flex", flexDirection: "column", gap: 8,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {/* Platform badge */}
          <span style={{
            fontSize: 10, fontWeight: 800, padding: "1px 6px", borderRadius: 4,
            background: PLATFORM_COLOR[comment.platform],
            color: "#fff", textTransform: "uppercase",
          }}>
            {PLATFORM_ICON[comment.platform]}
          </span>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#18181b" }}>
            {comment.platform === "facebook" ? comment.username : `@${comment.username}`}
          </span>
          {comment.timestamp && (
            <span style={{ fontSize: 11, color: "#a1a1aa" }}>{formatTime(comment.timestamp)}</span>
          )}
        </div>
        {comment.likeCount > 0 && (
          <span style={{ fontSize: 12, color: "#71717a", flexShrink: 0 }}>❤️ {comment.likeCount}</span>
        )}
      </div>

      <div style={{ fontSize: 13, color: "#27272a", lineHeight: 1.55 }}>
        {keywords.length ? highlightKeywords(comment.text, keywords) : comment.text}
      </div>

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
