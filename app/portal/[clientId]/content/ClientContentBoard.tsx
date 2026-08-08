"use client";

// ---------------------------------------------------------------------------
// Client-facing proofer board.
//
// A calm, per-day list of the month's posts. Each card shows the media and
// caption exactly as the operator planned it, and lets the client edit + save,
// add media, approve / unapprove, and leave comments.
// ---------------------------------------------------------------------------

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import ImageUpload from "../../../admin-panel/components/ImageUpload";
import { AutoGrowTextarea } from "../../../admin-panel/components/mobile";
import { PROOFER_PLATFORM_LABELS, type ProoferPlatform } from "../../../admin-panel/lib/types";
import { formatUtcClockInZone } from "@/lib/timezone";
import {
  addPortalCommentAction,
  savePortalPostAction,
  setPortalPostApprovalAction,
} from "./actions";

export type ClientComment = {
  id: string;
  comment: string;
  author: string;
  authorRole: "client" | "admin";
  resolved: boolean;
  createdAt: string;
};

export type ClientPost = {
  id: string;
  postDate: string;
  platform: string;
  caption: string;
  mediaUrls: string[];
  publishTime: string;
  status: string;
  published: boolean;
  comments: ClientComment[];
};

type Props = {
  clientId: number;
  month: string;
  monthLabel: string;
  prevMonth: string;
  nextMonth: string;
  posts: ClientPost[];
  timeZone: string;
};

const DAY_LABEL = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

function platformLabel(platform: string): string {
  return PROOFER_PLATFORM_LABELS[platform as ProoferPlatform] ?? platform;
}

function isDriveUrl(url: string): boolean {
  return /drive\.google\.com/.test(url);
}

function driveEmbedUrl(url: string): string {
  const m = url.match(/[-\w]{25,}/);
  return m ? `https://drive.google.com/file/d/${m[0]}/preview` : url;
}

function isVideoUrl(url: string): boolean {
  return /\.(mp4|mov|webm|m4v|ogv)(\?|$)/i.test(url) || /drive\.google\.com.*uc\?/.test(url);
}

function dayLabel(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  return DAY_LABEL.format(new Date(Date.UTC(y, m - 1, d)));
}

function relativeTime(iso: string): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Date.now() - then;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function ClientContentBoard({
  clientId,
  month,
  monthLabel,
  prevMonth,
  nextMonth,
  posts,
  timeZone,
}: Props) {
  // Group posts by day, preserving the incoming (date, time) order.
  const byDay = new Map<string, ClientPost[]>();
  for (const post of posts) {
    const list = byDay.get(post.postDate) ?? [];
    list.push(post);
    byDay.set(post.postDate, list);
  }
  const days = Array.from(byDay.keys());

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div>
        <div
          style={{
            fontSize: 12,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            color: "#64748b",
          }}
        >
          Content
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: "6px 0 0", color: "#0f172a" }}>
          Your posts this month
        </h1>
        <p style={{ margin: "8px 0 0", fontSize: 13, color: "#475569", lineHeight: 1.6, maxWidth: 640 }}>
          Review everything we&rsquo;ve planned for you. Tweak a caption, add
          your own photos or videos, leave a comment, and approve what&rsquo;s
          ready to go.
        </p>
      </div>

      <MonthNav
        clientId={clientId}
        monthLabel={monthLabel}
        prevMonth={prevMonth}
        nextMonth={nextMonth}
      />

      {days.length === 0 ? (
        <div
          style={{
            padding: 36,
            textAlign: "center",
            background: "#fff",
            border: "1px solid #e2e8f0",
            borderRadius: 12,
            color: "#94a3b8",
            fontSize: 14,
          }}
        >
          No posts planned for {monthLabel} yet.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          {days.map((day) => (
            <div key={day}>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: "#0f172a",
                  marginBottom: 10,
                }}
              >
                {dayLabel(day)}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {(byDay.get(day) ?? []).map((post) => (
                  <PostCard
                    key={post.id}
                    clientId={clientId}
                    post={post}
                    timeZone={timeZone}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MonthNav({
  clientId,
  monthLabel,
  prevMonth,
  nextMonth,
}: {
  clientId: number;
  monthLabel: string;
  prevMonth: string;
  nextMonth: string;
}) {
  const linkStyle: React.CSSProperties = {
    padding: "8px 14px",
    borderRadius: 10,
    border: "1px solid #e2e8f0",
    background: "#fff",
    color: "#0f172a",
    textDecoration: "none",
    fontSize: 13,
    fontWeight: 600,
  };
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        background: "#fff",
        border: "1px solid #e2e8f0",
        borderRadius: 12,
        padding: "10px 14px",
      }}
    >
      <Link href={`/portal/${clientId}/content?month=${prevMonth}`} style={linkStyle}>
        ← Previous
      </Link>
      <div style={{ fontSize: 15, fontWeight: 700, color: "#0f172a" }}>{monthLabel}</div>
      <Link href={`/portal/${clientId}/content?month=${nextMonth}`} style={linkStyle}>
        Next →
      </Link>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { label: string; bg: string; fg: string }> = {
    approved: { label: "Approved", bg: "#dcfce7", fg: "#166534" },
    proofed: { label: "Ready for you", bg: "#e0f2fe", fg: "#075985" },
    check: { label: "In progress", bg: "#fef3c7", fg: "#92400e" },
    improve: { label: "Being revised", bg: "#fee2e2", fg: "#991b1b" },
    none: { label: "Draft", bg: "#f1f5f9", fg: "#475569" },
  };
  const copy = map[status] ?? map.none;
  return (
    <span
      style={{
        padding: "4px 12px",
        borderRadius: 999,
        background: copy.bg,
        color: copy.fg,
        fontSize: 11,
        fontWeight: 600,
        whiteSpace: "nowrap",
      }}
    >
      {copy.label}
    </span>
  );
}

// A single media item filling a 1:1 square, matching the operator's proofer
// card sizing (width: 100%, objectFit: cover inside a fixed square).
function SquareMedia({ url }: { url: string }) {
  const fill: React.CSSProperties = {
    display: "block",
    width: "100%",
    height: "100%",
    objectFit: "cover",
    border: "none",
  };
  if (isDriveUrl(url) && isVideoUrl(url)) {
    return <iframe src={driveEmbedUrl(url)} style={{ ...fill, objectFit: undefined }} allow="autoplay" title="Video preview" />;
  }
  if (isVideoUrl(url)) {
    return <video src={url} controls style={fill} />;
  }
  if (isDriveUrl(url)) {
    return <iframe src={driveEmbedUrl(url)} style={{ ...fill, objectFit: undefined }} title="Preview" />;
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="" style={fill} />;
}

// Square carousel: one item at a time with prev/next nav + index badge,
// exactly like the operator's board. Also carries the remove control.
function MediaCarousel({
  urls,
  onRemove,
  disabled,
}: {
  urls: string[];
  onRemove: (idx: number) => void;
  disabled: boolean;
}) {
  const [idx, setIdx] = useState(0);
  const safeIdx = Math.min(idx, urls.length - 1);
  const activeUrl = urls[safeIdx];

  return (
    <div
      style={{
        width: "100%",
        aspectRatio: "1 / 1",
        background: "#f4f4f5",
        borderRadius: 10,
        overflow: "hidden",
        position: "relative",
      }}
    >
      {activeUrl && <SquareMedia url={activeUrl} />}

      {urls.length > 1 && (
        <>
          <button
            type="button"
            onClick={() => setIdx(Math.max(0, safeIdx - 1))}
            disabled={safeIdx === 0}
            aria-label="Previous"
            style={navArrow("left", safeIdx === 0)}
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => setIdx(Math.min(urls.length - 1, safeIdx + 1))}
            disabled={safeIdx === urls.length - 1}
            aria-label="Next"
            style={navArrow("right", safeIdx === urls.length - 1)}
          >
            ›
          </button>
          <div
            style={{
              position: "absolute",
              top: 8,
              right: 10,
              background: "rgba(0,0,0,0.6)",
              color: "#fff",
              fontSize: 11,
              fontWeight: 700,
              padding: "3px 7px",
              borderRadius: 99,
            }}
          >
            {safeIdx + 1}/{urls.length}
          </div>
        </>
      )}

      {activeUrl && (
        <button
          type="button"
          onClick={() => {
            onRemove(safeIdx);
            setIdx((prev) => Math.max(0, prev - (safeIdx === urls.length - 1 ? 1 : 0)));
          }}
          disabled={disabled}
          style={{
            position: "absolute",
            bottom: 8,
            right: 8,
            padding: "3px 8px",
            borderRadius: 6,
            border: "none",
            background: "rgba(180,0,0,0.75)",
            color: "#fff",
            fontSize: 11,
            fontWeight: 700,
            cursor: disabled ? "not-allowed" : "pointer",
          }}
        >
          Remove
        </button>
      )}
    </div>
  );
}

function navArrow(side: "left" | "right", disabled: boolean): React.CSSProperties {
  return {
    position: "absolute",
    [side]: 10,
    top: "50%",
    transform: "translateY(-50%)",
    background: "rgba(0,0,0,0.45)",
    border: "none",
    color: "#fff",
    borderRadius: "50%",
    width: 44,
    height: 44,
    cursor: disabled ? "default" : "pointer",
    fontSize: 28,
    lineHeight: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    opacity: disabled ? 0.25 : 1,
  } as React.CSSProperties;
}

function PostCard({
  clientId,
  post,
  timeZone,
}: {
  clientId: number;
  post: ClientPost;
  timeZone: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [caption, setCaption] = useState(post.caption);
  const [mediaUrls, setMediaUrls] = useState<string[]>(post.mediaUrls);
  const [commentDraft, setCommentDraft] = useState("");
  const [error, setError] = useState("");
  const [savedFlash, setSavedFlash] = useState(false);

  const isApproved = post.status === "approved";
  const dirty = caption !== post.caption || !arraysEqual(mediaUrls, post.mediaUrls);
  const clock = formatUtcClockInZone(post.postDate, post.publishTime, timeZone);

  // A post whose day has passed (or that's already published) is history: no
  // approve/edit controls — it shows "Published" or nothing.
  const todayStr = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const readOnly = post.published || post.postDate < todayStr;

  function run(fn: () => Promise<{ error: string | null }>, onOk?: () => void) {
    setError("");
    startTransition(async () => {
      const res = await fn();
      if (res?.error) {
        setError(res.error);
        return;
      }
      onOk?.();
      router.refresh();
    });
  }

  function handleSave() {
    run(
      () => savePortalPostAction(String(clientId), post.id, caption, mediaUrls),
      () => {
        setSavedFlash(true);
        setTimeout(() => setSavedFlash(false), 2000);
      }
    );
  }

  function handleApproval(next: boolean) {
    run(() => setPortalPostApprovalAction(String(clientId), post.id, next));
  }

  function handleComment() {
    const value = commentDraft.trim();
    if (!value) {
      setError("Write a comment first.");
      return;
    }
    run(
      () => addPortalCommentAction(String(clientId), post.id, value),
      () => setCommentDraft("")
    );
  }

  function removeMedia(idx: number) {
    setMediaUrls((prev) => prev.filter((_, i) => i !== idx));
  }

  return (
    <div
      style={{
        // Match the operator's proofer card footprint so posts read at the
        // same size clients see on our side.
        width: "100%",
        maxWidth: 500,
        background: "#fff",
        border: "1px solid #e2e8f0",
        borderRadius: 12,
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "#0f172a" }}>
          {platformLabel(post.platform)}
        </span>
        {clock && <span style={{ fontSize: 12, color: "#94a3b8" }}>{clock}</span>}
        <span style={{ flex: 1 }} />
        {post.published ? (
          <span
            style={{
              fontSize: 12,
              fontWeight: 700,
              padding: "3px 12px",
              borderRadius: 999,
              background: "#dcfce7",
              color: "#166534",
            }}
          >
            Published
          </span>
        ) : readOnly ? null : (
          <StatusPill status={post.status} />
        )}
      </div>

      {mediaUrls.length > 0 && (
        <MediaCarousel
          urls={mediaUrls}
          onRemove={removeMedia}
          disabled={pending || readOnly}
        />
      )}

      {!readOnly && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <ImageUpload
            folder={`proofer/${clientId}/${post.postDate.slice(0, 7)}`}
            bucket="postimages"
            accept="image/*"
            label="Add image"
            compact
            onUploaded={(url) => setMediaUrls((prev) => [...prev, url])}
          />
          <ImageUpload
            folder={`proofer/${clientId}/${post.postDate.slice(0, 7)}`}
            bucket="postimages"
            accept="video/*"
            label="Add video"
            compact
            onUploaded={(url) => setMediaUrls((prev) => [...prev, url])}
          />
        </div>
      )}

      {/* Caption. Read-only history shows the full text; editable posts grow to
          fit so the client never has to scroll inside the box. */}
      {readOnly ? (
        <div
          style={{
            width: "100%",
            fontSize: 14,
            lineHeight: 1.6,
            color: "#0f172a",
            whiteSpace: "pre-wrap",
          }}
        >
          {caption.trim() || <span style={{ color: "#94a3b8" }}>No caption</span>}
        </div>
      ) : (
        <AutoGrowTextarea
          value={caption}
          minHeight={90}
          maxHeight={4000}
          onChange={(e) => setCaption(e.target.value)}
          placeholder="Write a caption…"
          style={{
            width: "100%",
            padding: 12,
            borderRadius: 10,
            border: "1px solid #e2e8f0",
            fontSize: 14,
            lineHeight: 1.6,
            color: "#0f172a",
            fontFamily: "inherit",
            boxSizing: "border-box",
          }}
        />
      )}

      {!readOnly && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <button
            type="button"
            onClick={handleSave}
            disabled={pending || !dirty}
            style={btnStyle(dirty ? "#0f172a" : "#e2e8f0", dirty ? "#fff" : "#94a3b8", pending || !dirty)}
          >
            {savedFlash ? "Saved ✓" : "Save changes"}
          </button>

          {isApproved ? (
            <button
              type="button"
              onClick={() => handleApproval(false)}
              disabled={pending}
              style={btnStyle("#fff", "#991b1b", pending, "#fecaca")}
            >
              Unapprove
            </button>
          ) : (
            <button
              type="button"
              onClick={() => handleApproval(true)}
              disabled={pending}
              style={btnStyle("#16a34a", "#fff", pending)}
            >
              Approve
            </button>
          )}
          {dirty && (
            <span style={{ fontSize: 12, color: "#94a3b8" }}>Unsaved changes</span>
          )}
        </div>
      )}

      {error && <div style={{ fontSize: 12, color: "#dc2626" }}>{error}</div>}

      <CommentThread
        comments={post.comments}
        draft={commentDraft}
        onDraft={setCommentDraft}
        onSubmit={handleComment}
        pending={pending}
      />
    </div>
  );
}

function CommentThread({
  comments,
  draft,
  onDraft,
  onSubmit,
  pending,
}: {
  comments: ClientComment[];
  draft: string;
  onDraft: (v: string) => void;
  onSubmit: () => void;
  pending: boolean;
}) {
  return (
    <div style={{ borderTop: "1px solid #f1f5f9", paddingTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: "#64748b" }}>
        Comments {comments.length > 0 ? `(${comments.length})` : ""}
      </div>

      {comments.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {comments.map((c) => (
            <div
              key={c.id}
              style={{
                background: c.authorRole === "client" ? "#eff6ff" : "#f8fafc",
                border: "1px solid #e2e8f0",
                borderRadius: 10,
                padding: "8px 10px",
              }}
            >
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 2 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "#0f172a" }}>
                  {c.authorRole === "client" ? "You" : "Your team"}
                </span>
                <span style={{ fontSize: 11, color: "#94a3b8" }}>{relativeTime(c.createdAt)}</span>
                {c.resolved && (
                  <span style={{ fontSize: 10, color: "#16a34a", fontWeight: 600 }}>Resolved</span>
                )}
              </div>
              <div style={{ fontSize: 13, color: "#334155", whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
                {c.comment}
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
        <textarea
          value={draft}
          onChange={(e) => onDraft(e.target.value)}
          rows={2}
          placeholder="Leave a comment for your team…"
          style={{
            flex: 1,
            resize: "vertical",
            padding: 10,
            borderRadius: 10,
            border: "1px solid #e2e8f0",
            fontSize: 13,
            fontFamily: "inherit",
            color: "#0f172a",
            boxSizing: "border-box",
          }}
        />
        <button
          type="button"
          onClick={onSubmit}
          disabled={pending || !draft.trim()}
          style={btnStyle(
            draft.trim() ? "#0f172a" : "#e2e8f0",
            draft.trim() ? "#fff" : "#94a3b8",
            pending || !draft.trim()
          )}
        >
          Send
        </button>
      </div>
    </div>
  );
}

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}

function btnStyle(bg: string, fg: string, disabled: boolean, border?: string): React.CSSProperties {
  return {
    padding: "8px 14px",
    borderRadius: 10,
    border: border ? `1px solid ${border}` : "1px solid transparent",
    background: bg,
    color: fg,
    fontSize: 13,
    fontWeight: 600,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.7 : 1,
    whiteSpace: "nowrap",
  };
}
