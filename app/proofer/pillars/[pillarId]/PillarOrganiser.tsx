"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  saveProoferPostAction,
  deleteProoferPostAction,
} from "../../../admin-panel/lib/proofer-actions";
import ImageUpload from "../../../admin-panel/components/ImageUpload";
import { PROOFER_PLATFORM_LABELS } from "../../../admin-panel/lib/types";
import type { ProoferPlatform } from "../../../admin-panel/lib/types";

type Post = {
  id: string;
  postDate: string;
  caption: string;
  mediaUrls: string[];
  platform: string;
  status: string;
  publishTime: string;
  publishTargets: string[];
  linkedIdeaId: string | null;
  linkedIdeaKind: string | null;
};

function dayLabel(postDate: string): string {
  const [y, m, d] = postDate.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return postDate;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function PillarOrganiser({
  clientId,
  pillar,
  month,
  posts,
}: {
  clientId: string;
  pillar: { id: string; name: string; color: string };
  month: string;
  posts: Post[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [savingId, setSavingId] = useState<string | null>(null);
  const [captions, setCaptions] = useState<Record<string, string>>(() =>
    Object.fromEntries(posts.map((p) => [p.id, p.caption]))
  );
  const [media, setMedia] = useState<Record<string, string[]>>(() =>
    Object.fromEntries(posts.map((p) => [p.id, p.mediaUrls]))
  );
  const [deleted, setDeleted] = useState<Set<string>>(new Set());

  // Same calendar month as the one on screen surfaces first, newest first.
  const viewedMonth = Number(month.split("-")[1]) || 0;
  const ordered = useMemo(() => {
    const sameMonth = (d: string) =>
      Number(d.slice(5, 7)) === viewedMonth ? 0 : 1;
    return [...posts].sort((a, b) => {
      const ra = sameMonth(a.postDate);
      const rb = sameMonth(b.postDate);
      if (ra !== rb) return ra - rb;
      return b.postDate.localeCompare(a.postDate);
    });
  }, [posts, viewedMonth]);

  function persist(post: Post, caption: string, mediaUrls: string[]) {
    setSavingId(post.id);
    startTransition(async () => {
      try {
        await saveProoferPostAction(
          clientId,
          post.postDate,
          post.platform,
          caption,
          mediaUrls,
          pillar.id,
          post.linkedIdeaId,
          post.linkedIdeaKind,
          post.publishTime,
          post.publishTargets
        );
        router.refresh();
      } finally {
        setSavingId(null);
      }
    });
  }

  function addImage(post: Post, url: string) {
    const next = [...(media[post.id] ?? []), url];
    setMedia((m) => ({ ...m, [post.id]: next }));
    persist(post, captions[post.id] ?? post.caption, next);
  }

  function removeImage(post: Post, url: string) {
    const next = (media[post.id] ?? []).filter((u) => u !== url);
    setMedia((m) => ({ ...m, [post.id]: next }));
    persist(post, captions[post.id] ?? post.caption, next);
  }

  function saveCaption(post: Post) {
    persist(post, captions[post.id] ?? "", media[post.id] ?? []);
  }

  function deletePost(post: Post) {
    if (
      !window.confirm(
        "Delete this post from the library? This removes it from the board too."
      )
    )
      return;
    setSavingId(post.id);
    startTransition(async () => {
      try {
        await deleteProoferPostAction(clientId, post.postDate, post.platform);
        setDeleted((s) => new Set(s).add(post.id));
        router.refresh();
      } finally {
        setSavingId(null);
      }
    });
  }

  const visible = ordered.filter((p) => !deleted.has(p.id));

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
        <span
          aria-hidden
          style={{
            width: 26,
            height: 26,
            borderRadius: "50%",
            background: pillar.color || "#a1a1aa",
            boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.06)",
            flexShrink: 0,
          }}
        />
        <div>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em" }}>
            {pillar.name}
          </h1>
          <div style={{ fontSize: 13, color: "#71717a", marginTop: 2 }}>
            {visible.length} post{visible.length === 1 ? "" : "s"} · all time · this
            month first
          </div>
        </div>
      </div>

      {visible.length === 0 ? (
        <div
          style={{
            padding: 24,
            border: "1px dashed #d4d4d8",
            borderRadius: 12,
            color: "#71717a",
            fontSize: 14,
            background: "#fafafa",
          }}
        >
          No posts in this pillar yet.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {visible.map((post) => {
            const saving = savingId === post.id && isPending;
            const urls = media[post.id] ?? [];
            const platformLabel =
              PROOFER_PLATFORM_LABELS[post.platform as ProoferPlatform] ??
              post.platform;
            return (
              <div
                key={post.id}
                style={{
                  border: "1px solid #e4e4e7",
                  borderRadius: 14,
                  background: "#fff",
                  padding: 16,
                  display: "grid",
                  gridTemplateColumns: "minmax(0, 1fr)",
                  gap: 12,
                  opacity: saving ? 0.7 : 1,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>{dayLabel(post.postDate)}</span>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: "#3f3f46",
                      background: "#f4f4f5",
                      borderRadius: 999,
                      padding: "2px 9px",
                    }}
                  >
                    {platformLabel}
                  </span>
                  {saving && (
                    <span style={{ fontSize: 12, color: "#a1a1aa" }}>Saving…</span>
                  )}
                  <button
                    type="button"
                    onClick={() => deletePost(post)}
                    disabled={saving}
                    style={{
                      marginLeft: "auto",
                      border: "1px solid #fca5a5",
                      background: "#fff",
                      color: "#b3261e",
                      fontSize: 12,
                      fontWeight: 700,
                      borderRadius: 8,
                      padding: "6px 11px",
                      cursor: saving ? "wait" : "pointer",
                    }}
                  >
                    Delete from library
                  </button>
                </div>

                {/* Media */}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  {urls.map((url) => (
                    <div key={url} style={{ position: "relative", width: 92, height: 92 }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={url}
                        alt=""
                        style={{
                          width: 92,
                          height: 92,
                          objectFit: "cover",
                          borderRadius: 10,
                          border: "1px solid #e4e4e7",
                          display: "block",
                          background: "#f4f4f5",
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => removeImage(post, url)}
                        disabled={saving}
                        aria-label="Remove image"
                        style={{
                          position: "absolute",
                          top: 4,
                          right: 4,
                          width: 22,
                          height: 22,
                          borderRadius: "50%",
                          border: "none",
                          background: "rgba(0,0,0,0.6)",
                          color: "#fff",
                          fontSize: 13,
                          lineHeight: 1,
                          cursor: saving ? "wait" : "pointer",
                        }}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  <ImageUpload
                    bucket="postimages"
                    folder={`proofer/${clientId}/${post.postDate.slice(0, 7)}`}
                    onUploaded={(url) => addImage(post, url)}
                    label="＋ Add image"
                    accept="image/*,video/*"
                  />
                </div>

                {/* Caption */}
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <textarea
                    value={captions[post.id] ?? ""}
                    onChange={(e) =>
                      setCaptions((c) => ({ ...c, [post.id]: e.target.value }))
                    }
                    rows={3}
                    placeholder="Write a caption…"
                    style={{
                      width: "100%",
                      resize: "vertical",
                      border: "1px solid #e4e4e7",
                      borderRadius: 10,
                      padding: "10px 12px",
                      fontSize: 14,
                      lineHeight: 1.5,
                      color: "#18181b",
                      fontFamily: "inherit",
                      minHeight: 72,
                    }}
                  />
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      type="button"
                      onClick={() => saveCaption(post)}
                      disabled={saving || (captions[post.id] ?? "") === post.caption}
                      style={{
                        border: "1px solid #18181b",
                        background: "#18181b",
                        color: "#fff",
                        fontSize: 13,
                        fontWeight: 700,
                        borderRadius: 8,
                        padding: "8px 14px",
                        cursor:
                          saving || (captions[post.id] ?? "") === post.caption
                            ? "default"
                            : "pointer",
                        opacity:
                          (captions[post.id] ?? "") === post.caption ? 0.5 : 1,
                      }}
                    >
                      Save text
                    </button>
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
