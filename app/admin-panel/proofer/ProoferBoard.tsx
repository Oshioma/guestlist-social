"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import SectionCard from "../components/SectionCard";
import ImageUpload from "../components/ImageUpload";
import type { ProoferPost, ProoferStatus } from "../lib/types";
import {
  saveProoferPostAction,
  updateProoferStatusAction,
  deleteProoferPostAction,
  addProoferCommentAction,
  toggleProoferCommentResolvedAction,
} from "../lib/proofer-actions";

type ClientLite = { id: string; name: string };
type MonthOpt = { value: string; label: string };

type ProoferCommentLite = {
  id: string;
  postId: string;
  comment: string;
  createdBy: string;
  resolved: boolean;
  createdAt: string;
};

const STATUS_BUTTONS: {
  value: ProoferStatus;
  label: string;
  bg: string;
  border: string;
  color: string;
}[] = [
  {
    value: "improve",
    label: "Improve",
    bg: "#fee2e2",
    border: "#fca5a5",
    color: "#991b1b",
  },
  {
    value: "check",
    label: "Check",
    bg: "#fef9c3",
    border: "#fde047",
    color: "#854d0e",
  },
  {
    value: "proofed",
    label: "Proofed",
    bg: "#dcfce7",
    border: "#86efac",
    color: "#166534",
  },
];

function daysInMonth(month: string): Date[] {
  const [y, m] = month.split("-").map(Number);
  if (!y || !m) return [];
  const out: Date[] = [];
  const last = new Date(y, m, 0).getDate();
  for (let i = 1; i <= last; i++) {
    out.push(new Date(y, m - 1, i));
  }
  return out;
}

function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${day}`;
}

function formatDayLong(d: Date): string {
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatCommentTime(value: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

function prettyFileName(url: string): string {
  if (!url) return "";
  try {
    const u = new URL(url);
    const last = u.pathname.split("/").filter(Boolean).pop() ?? "";
    const decoded = decodeURIComponent(last);
    return decoded.replace(/^\d{10,}_/, "") || url;
  } catch {
    return url.split("/").pop() || url;
  }
}

function isVideoUrl(url: string): boolean {
  return /\.(mp4|mov|webm|m4v|ogv)(\?|$)/i.test(url);
}

const inputStyle: React.CSSProperties = {
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid #e4e4e7",
  fontSize: 13,
  background: "#fff",
  color: "#18181b",
  fontFamily: "inherit",
};

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  color: "#71717a",
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};

const secondaryButtonStyle: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 8,
  border: "1px solid #e4e4e7",
  background: "#fff",
  color: "#3f3f46",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
};

export default function ProoferBoard({
  clients,
  months,
  initialClientId,
  initialMonth,
  initialPosts,
}: {
  clients: ClientLite[];
  months: MonthOpt[];
  initialClientId: string;
  initialMonth: string;
  initialPosts: ProoferPost[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [clientId, setClientId] = useState(initialClientId);
  const [month, setMonth] = useState(initialMonth);
  const [hideEmpty, setHideEmpty] = useState(false);

  type Draft = { caption: string; imageUrl: string };
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [openComments, setOpenComments] = useState<Record<string, boolean>>({});
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});

  const postsByDate = useMemo(() => {
    const map = new Map<string, ProoferPost>();
    initialPosts.forEach((p) => map.set(p.postDate.slice(0, 10), p));
    return map;
  }, [initialPosts]);

  const days = useMemo(() => daysInMonth(month), [month]);

  function getDraftFor(key: string): Draft {
    if (drafts[key]) return drafts[key];
    const existing = postsByDate.get(key);
    return {
      caption: existing?.caption ?? "",
      imageUrl: existing?.imageUrl ?? "",
    };
  }

  function updateDraft(key: string, patch: Partial<Draft>) {
    setDrafts((prev) => ({
      ...prev,
      [key]: { ...getDraftFor(key), ...patch },
    }));
  }

  function navigate(nextClientId: string, nextMonth: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("client", nextClientId);
    params.set("month", nextMonth);
    setDrafts({});
    setOpenComments({});
    setCommentDrafts({});
    router.push(`/app/proofer?${params.toString()}`);
  }

  function handleSelectClient(id: string) {
    setClientId(id);
    navigate(id, month);
  }

  function handleSelectMonth(value: string) {
    setMonth(value);
    navigate(clientId, value);
  }

  function handleSave(dateKey: string) {
    const draft = getDraftFor(dateKey);
    startTransition(async () => {
      try {
        await saveProoferPostAction(
          clientId,
          dateKey,
          draft.caption,
          draft.imageUrl
        );
        setDrafts((prev) => {
          const next = { ...prev };
          delete next[dateKey];
          return next;
        });
        router.refresh();
      } catch (err) {
        alert(err instanceof Error ? err.message : "Could not save");
      }
    });
  }

  function handleStatus(dateKey: string, status: ProoferStatus) {
    startTransition(async () => {
      try {
        const draft = drafts[dateKey];
        if (draft) {
          await saveProoferPostAction(
            clientId,
            dateKey,
            draft.caption,
            draft.imageUrl
          );
          setDrafts((prev) => {
            const next = { ...prev };
            delete next[dateKey];
            return next;
          });
        }
        await updateProoferStatusAction(clientId, dateKey, status);
        router.refresh();
      } catch (err) {
        alert(err instanceof Error ? err.message : "Could not update status");
      }
    });
  }

  function handleDelete(dateKey: string) {
    if (!confirm("Clear this day?")) return;
    startTransition(async () => {
      try {
        await deleteProoferPostAction(clientId, dateKey);
        setDrafts((prev) => {
          const next = { ...prev };
          delete next[dateKey];
          return next;
        });
        setCommentDrafts((prev) => {
          const next = { ...prev };
          delete next[dateKey];
          return next;
        });
        router.refresh();
      } catch (err) {
        alert(err instanceof Error ? err.message : "Could not delete");
      }
    });
  }

  function toggleComments(dateKey: string) {
    setOpenComments((prev) => ({
      ...prev,
      [dateKey]: !prev[dateKey],
    }));
  }

  function handleAddComment(dateKey: string, postId?: string) {
    const value = (commentDrafts[dateKey] ?? "").trim();
    if (!postId) {
      alert("Save the post first before adding comments.");
      return;
    }
    if (!value) {
      alert("Write a comment first.");
      return;
    }

    startTransition(async () => {
      try {
        await addProoferCommentAction(postId, value);
        setCommentDrafts((prev) => ({
          ...prev,
          [dateKey]: "",
        }));
        setOpenComments((prev) => ({
          ...prev,
          [dateKey]: true,
        }));
        router.refresh();
      } catch (err) {
        alert(err instanceof Error ? err.message : "Could not add comment");
      }
    });
  }

  function handleToggleResolved(commentId: string, resolved: boolean) {
    startTransition(async () => {
      try {
        await toggleProoferCommentResolvedAction(commentId, resolved);
        router.refresh();
      } catch (err) {
        alert(
          err instanceof Error ? err.message : "Could not update comment status"
        );
      }
    });
  }

  const visibleDays = useMemo(() => {
    if (!hideEmpty) return days;
    return days.filter((d) => {
      const key = toDateKey(d);
      const draft = drafts[key];
      const post = postsByDate.get(key);
      const caption = draft?.caption ?? post?.caption ?? "";
      const imageUrl = draft?.imageUrl ?? post?.imageUrl ?? "";
      return (
        caption.trim().length > 0 ||
        imageUrl.trim().length > 0 ||
        (post && post.status !== "none")
      );
    });
  }, [days, drafts, postsByDate, hideEmpty]);

  const totalWithContent = useMemo(
    () =>
      days.filter((d) => {
        const key = toDateKey(d);
        const post = postsByDate.get(key);
        return post && (post.caption || post.imageUrl);
      }).length,
    [days, postsByDate]
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div>
        <h1
          style={{
            margin: 0,
            fontSize: 30,
            lineHeight: 1.05,
            fontWeight: 700,
            color: "#18181b",
            letterSpacing: "-0.03em",
          }}
        >
          Proofer
        </h1>
        <p
          style={{
            margin: "8px 0 0",
            fontSize: 14,
            color: "#71717a",
            maxWidth: 760,
          }}
        >
          Draft captions and upload images for every day of the month, then
          flag each post as Improve, Check or Proofed as it moves through
          review.
        </p>
      </div>

      <SectionCard title="Settings">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: 12,
            alignItems: "flex-end",
          }}
        >
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={labelStyle}>Client</span>
            <select
              value={clientId}
              onChange={(e) => handleSelectClient(e.target.value)}
              disabled={isPending || clients.length === 0}
              style={inputStyle}
            >
              {clients.length === 0 && <option value="">No clients</option>}
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={labelStyle}>Month</span>
            <select
              value={month}
              onChange={(e) => handleSelectMonth(e.target.value)}
              disabled={isPending}
              style={inputStyle}
            >
              {months.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>

          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 13,
              color: "#52525b",
              paddingBottom: 8,
            }}
          >
            <input
              type="checkbox"
              checked={hideEmpty}
              onChange={(e) => setHideEmpty(e.target.checked)}
            />
            Hide empty days
          </label>

          <div style={{ fontSize: 12, color: "#71717a", paddingBottom: 10 }}>
            {totalWithContent} of {days.length} days have content
          </div>
        </div>
      </SectionCard>

      {clients.length === 0 ? (
        <SectionCard title="No clients">
          <div style={{ fontSize: 13, color: "#71717a" }}>
            Add a client first on the Clients page.
          </div>
        </SectionCard>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {visibleDays.length === 0 && (
            <SectionCard title="Nothing to show">
              <div style={{ fontSize: 13, color: "#71717a" }}>
                All days are empty. Uncheck <strong>Hide empty days</strong> to
                start drafting.
              </div>
            </SectionCard>
          )}

          {visibleDays.map((d) => {
            const key = toDateKey(d);
            const post = postsByDate.get(key);
            const draft = getDraftFor(key);
            const hasDraft = Boolean(drafts[key]);
            const hasContent = Boolean(
              draft.caption.trim() || draft.imageUrl.trim()
            );

            const comments = ((post as ProoferPost & {
              comments?: ProoferCommentLite[];
            })?.comments ?? []) as ProoferCommentLite[];

            const commentCount = comments.length;
            const unresolvedCount = comments.filter((c) => !c.resolved).length;
            const commentsOpen = Boolean(openComments[key]);

            const effectiveStatus: ProoferStatus =
              post?.status && post.status !== "none"
                ? post.status
                : hasContent
                ? "check"
                : "none";

            return (
              <div
                key={key}
                style={{
                  background: "#fff",
                  border: "1px solid #e4e4e7",
                  borderRadius: 12,
                  padding: 16,
                  display: "grid",
                  gridTemplateColumns: "180px 1fr",
                  gap: 16,
                  alignItems: "flex-start",
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: "#18181b",
                      lineHeight: 1.2,
                    }}
                  >
                    {formatDayLong(d)}
                  </div>

                  {post?.createdBy && (
                    <div
                      style={{
                        marginTop: 6,
                        fontSize: 11,
                        color: "#71717a",
                      }}
                    >
                      First saved by{" "}
                      <strong style={{ color: "#52525b" }}>
                        {post.createdBy}
                      </strong>
                    </div>
                  )}

                  {hasDraft && (
                    <div
                      style={{
                        marginTop: 6,
                        fontSize: 11,
                        color: "#b45309",
                        fontWeight: 600,
                      }}
                    >
                      Unsaved changes
                    </div>
                  )}
                </div>

                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                  }}
                >
                  <textarea
                    value={draft.caption}
                    onChange={(e) =>
                      updateDraft(key, { caption: e.target.value })
                    }
                    placeholder="Write a caption..."
                    style={{
                      ...inputStyle,
                      minHeight: 70,
                      resize: "vertical",
                      fontFamily: "inherit",
                    }}
                  />

                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      alignItems: "center",
                      flexWrap: "wrap",
                    }}
                  >
                    {draft.imageUrl ? (
                      <div
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 8,
                          padding: "6px 10px",
                          borderRadius: 999,
                          background: "#f4f4f5",
                          border: "1px solid #e4e4e7",
                          fontSize: 12,
                          color: "#3f3f46",
                          maxWidth: "100%",
                        }}
                      >
                        <span
                          style={{
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            maxWidth: 260,
                          }}
                          title={draft.imageUrl}
                        >
                          {prettyFileName(draft.imageUrl)}
                        </span>
                        <button
                          type="button"
                          onClick={() => updateDraft(key, { imageUrl: "" })}
                          style={{
                            border: "none",
                            background: "transparent",
                            color: "#71717a",
                            cursor: "pointer",
                            fontSize: 14,
                            lineHeight: 1,
                            padding: 0,
                          }}
                          aria-label="Remove media"
                        >
                          ×
                        </button>
                      </div>
                    ) : (
                      <input
                        type="text"
                        value={draft.imageUrl}
                        onChange={(e) =>
                          updateDraft(key, { imageUrl: e.target.value })
                        }
                        placeholder="Paste media URL or upload"
                        style={{ ...inputStyle, flex: 1, minWidth: 200 }}
                      />
                    )}

                    <ImageUpload
                      bucket="postimages"
                      folder={`proofer/${clientId}/${month}`}
                      onUploaded={(url) => updateDraft(key, { imageUrl: url })}
                      label="Upload media"
                      accept="image/*,video/*"
                    />
                  </div>

                  {draft.imageUrl && (
                    <div
                      style={{
                        width: "100%",
                        maxWidth: 500,
                        background: "#fff",
                        border: "1px solid #e4e4e7",
                        borderRadius: 12,
                        overflow: "hidden",
                        boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          padding: "10px 12px",
                        }}
                      >
                        <div
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: "50%",
                            background: "#e4e4e7",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 12,
                            fontWeight: 700,
                            color: "#71717a",
                          }}
                        >
                          {(
                            clients.find((c) => c.id === clientId)?.name ?? "?"
                          )
                            .charAt(0)
                            .toUpperCase()}
                        </div>

                        <div style={{ display: "flex", flexDirection: "column" }}>
                          <span
                            style={{
                              fontSize: 13,
                              fontWeight: 600,
                              color: "#18181b",
                              lineHeight: 1.2,
                            }}
                          >
                            {clients.find((c) => c.id === clientId)?.name ??
                              "Client"}
                          </span>
                          <span
                            style={{
                              fontSize: 11,
                              color: "#71717a",
                              lineHeight: 1.2,
                            }}
                          >
                            {formatDayLong(d)}
                          </span>
                        </div>
                      </div>

                      <div
                        style={{
                          width: "100%",
                          aspectRatio: "1 / 1",
                          background: "#fafafa",
                          overflow: "hidden",
                        }}
                      >
                        {isVideoUrl(draft.imageUrl) ? (
                          <video
                            src={draft.imageUrl}
                            controls
                            style={{
                              display: "block",
                              width: "100%",
                              height: "100%",
                              objectFit: "cover",
                            }}
                          />
                        ) : (
                          <img
                            src={draft.imageUrl}
                            alt="Preview"
                            style={{
                              display: "block",
                              width: "100%",
                              height: "100%",
                              objectFit: "cover",
                            }}
                            onError={(e) => {
                              (
                                e.currentTarget as HTMLImageElement
                              ).style.display = "none";
                            }}
                          />
                        )}
                      </div>

                      {draft.caption.trim() && (
                        <div
                          style={{
                            padding: "10px 12px 12px",
                            fontSize: 13,
                            color: "#18181b",
                            whiteSpace: "pre-wrap",
                            lineHeight: 1.4,
                          }}
                        >
                          {draft.caption}
                        </div>
                      )}
                    </div>
                  )}

                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      flexWrap: "wrap",
                      alignItems: "center",
                    }}
                  >
                    {STATUS_BUTTONS.map((btn) => {
                      const active = effectiveStatus === btn.value;
                      return (
                        <button
                          key={btn.value}
                          type="button"
                          onClick={() => handleStatus(key, btn.value)}
                          disabled={isPending}
                          style={{
                            padding: "6px 14px",
                            borderRadius: 999,
                            border: active
                              ? `2px solid ${btn.border}`
                              : "1px solid #e4e4e7",
                            background: active ? btn.bg : "#fff",
                            color: active ? btn.color : "#71717a",
                            fontSize: 12,
                            fontWeight: 700,
                            cursor: "pointer",
                            boxShadow: active ? `0 0 0 2px ${btn.bg}` : "none",
                          }}
                        >
                          {btn.label}
                        </button>
                      );
                    })}

                    <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                      <button
                        type="button"
                        onClick={() => handleSave(key)}
                        disabled={isPending || !hasDraft}
                        style={{
                          padding: "8px 14px",
                          borderRadius: 8,
                          background: hasDraft ? "#18181b" : "#e4e4e7",
                          color: hasDraft ? "#fff" : "#a1a1aa",
                          border: "none",
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: hasDraft ? "pointer" : "default",
                        }}
                      >
                        Save
                      </button>

                      {(post || hasDraft) && (
                        <button
                          type="button"
                          onClick={() => handleDelete(key)}
                          disabled={isPending}
                          style={{
                            ...secondaryButtonStyle,
                            color: "#991b1b",
                          }}
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  </div>

                  <div
                    style={{
                      marginTop: 2,
                      borderTop: "1px solid #f4f4f5",
                      paddingTop: 12,
                      display: "flex",
                      flexDirection: "column",
                      gap: 10,
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => toggleComments(key)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 12,
                        border: "1px solid #e4e4e7",
                        borderRadius: 10,
                        background: "#fafafa",
                        padding: "10px 12px",
                        cursor: "pointer",
                        fontSize: 13,
                        color: "#27272a",
                        fontWeight: 600,
                      }}
                    >
                      <span>
                        Comments {commentCount > 0 ? `(${commentCount})` : ""}
                      </span>
                      <span
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          color: "#71717a",
                          fontSize: 12,
                          fontWeight: 600,
                        }}
                      >
                        {unresolvedCount > 0 && (
                          <span
                            style={{
                              padding: "3px 8px",
                              borderRadius: 999,
                              background: "#fff7ed",
                              border: "1px solid #fdba74",
                              color: "#9a3412",
                            }}
                          >
                            {unresolvedCount} open
                          </span>
                        )}
                        <span>{commentsOpen ? "Hide" : "Show"}</span>
                      </span>
                    </button>

                    {commentsOpen && (
                      <div
                        style={{
                          border: "1px solid #e4e4e7",
                          borderRadius: 12,
                          padding: 12,
                          background: "#fff",
                          display: "flex",
                          flexDirection: "column",
                          gap: 10,
                        }}
                      >
                        {comments.length === 0 ? (
                          <div style={{ fontSize: 12, color: "#71717a" }}>
                            No comments yet.
                          </div>
                        ) : (
                          <div
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              gap: 8,
                            }}
                          >
                            {comments.map((comment) => (
                              <div
                                key={comment.id}
                                style={{
                                  border: "1px solid #e4e4e7",
                                  borderRadius: 10,
                                  padding: 10,
                                  background: comment.resolved
                                    ? "#fafafa"
                                    : "#fff",
                                  opacity: comment.resolved ? 0.75 : 1,
                                }}
                              >
                                <div
                                  style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                    gap: 10,
                                    marginBottom: 6,
                                    flexWrap: "wrap",
                                  }}
                                >
                                  <div
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      gap: 8,
                                      flexWrap: "wrap",
                                      fontSize: 12,
                                    }}
                                  >
                                    <strong style={{ color: "#27272a" }}>
                                      {comment.createdBy || "Unknown"}
                                    </strong>
                                    <span style={{ color: "#71717a" }}>
                                      {formatCommentTime(comment.createdAt)}
                                    </span>
                                    <span
                                      style={{
                                        padding: "2px 8px",
                                        borderRadius: 999,
                                        background: "#eff6ff",
                                        border: "1px solid #bfdbfe",
                                        color: "#1d4ed8",
                                        fontWeight: 600,
                                      }}
                                    >
                                      Client-visible
                                    </span>
                                    {comment.resolved && (
                                      <span
                                        style={{
                                          padding: "2px 8px",
                                          borderRadius: 999,
                                          background: "#ecfdf5",
                                          border: "1px solid #86efac",
                                          color: "#166534",
                                          fontWeight: 600,
                                        }}
                                      >
                                        Resolved
                                      </span>
                                    )}
                                  </div>

                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleToggleResolved(
                                        comment.id,
                                        !comment.resolved
                                      )
                                    }
                                    disabled={isPending}
                                    style={{
                                      ...secondaryButtonStyle,
                                      padding: "6px 10px",
                                    }}
                                  >
                                    {comment.resolved ? "Reopen" : "Resolve"}
                                  </button>
                                </div>

                                <div
                                  style={{
                                    fontSize: 13,
                                    color: "#18181b",
                                    lineHeight: 1.45,
                                    whiteSpace: "pre-wrap",
                                  }}
                                >
                                  {comment.comment}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 8,
                            paddingTop: 4,
                          }}
                        >
                          <textarea
                            value={commentDrafts[key] ?? ""}
                            onChange={(e) =>
                              setCommentDrafts((prev) => ({
                                ...prev,
                                [key]: e.target.value,
                              }))
                            }
                            placeholder={
                              post
                                ? "Add a comment for the client..."
                                : "Save the post first before adding comments..."
                            }
                            disabled={!post}
                            style={{
                              ...inputStyle,
                              minHeight: 80,
                              resize: "vertical",
                              fontFamily: "inherit",
                              opacity: post ? 1 : 0.7,
                            }}
                          />

                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              gap: 10,
                              flexWrap: "wrap",
                            }}
                          >
                            <div style={{ fontSize: 12, color: "#71717a" }}>
                              Comments here are shown as client-visible feedback.
                            </div>

                            <button
                              type="button"
                              onClick={() => handleAddComment(key, post?.id)}
                              disabled={isPending || !post}
                              style={{
                                padding: "8px 14px",
                                borderRadius: 8,
                                background: post ? "#18181b" : "#e4e4e7",
                                color: post ? "#fff" : "#a1a1aa",
                                border: "none",
                                fontSize: 12,
                                fontWeight: 700,
                                cursor: post ? "pointer" : "default",
                              }}
                            >
                              Add comment
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
