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

type MonthPost = { postDate: string; platform: string };

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

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

export default function PillarOrganiser({
  clientId,
  pillar,
  month,
  posts,
  monthPosts,
}: {
  clientId: string;
  pillar: { id: string; name: string; color: string };
  month: string;
  posts: Post[];
  monthPosts: MonthPost[];
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
  const [times, setTimes] = useState<Record<string, string>>(() =>
    Object.fromEntries(posts.map((p) => [p.id, p.publishTime || "18:00"]))
  );
  const [deleted, setDeleted] = useState<Set<string>>(new Set());
  const [pickFor, setPickFor] = useState<string | null>(null);

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

  // Month grid + which days already carry a post per platform (to grey them out
  // in the "add to a day" picker).
  const [gy, gm] = month.split("-").map(Number);
  const monthCells = useMemo(() => {
    if (!gy || !gm) return [] as (number | null)[];
    const lead = new Date(gy, gm - 1, 1).getDay();
    const total = new Date(gy, gm, 0).getDate();
    const cells: (number | null)[] = Array(lead).fill(null);
    for (let d = 1; d <= total; d++) cells.push(d);
    return cells;
  }, [gy, gm]);

  const occupiedByPlatform = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const mp of monthPosts) {
      const set = map.get(mp.platform) ?? new Set<string>();
      set.add(mp.postDate.slice(0, 10));
      map.set(mp.platform, set);
    }
    return map;
  }, [monthPosts]);

  const dateStr = (d: number) =>
    `${gy}-${String(gm).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

  function persist(
    post: Post,
    caption: string,
    mediaUrls: string[],
    publishTime: string
  ) {
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
          publishTime,
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
    persist(post, captions[post.id] ?? post.caption, next, times[post.id] ?? post.publishTime);
  }
  function removeImage(post: Post, url: string) {
    const next = (media[post.id] ?? []).filter((u) => u !== url);
    setMedia((m) => ({ ...m, [post.id]: next }));
    persist(post, captions[post.id] ?? post.caption, next, times[post.id] ?? post.publishTime);
  }
  function saveCaption(post: Post) {
    persist(post, captions[post.id] ?? "", media[post.id] ?? [], times[post.id] ?? post.publishTime);
  }
  function reschedule(post: Post) {
    persist(post, captions[post.id] ?? post.caption, media[post.id] ?? [], times[post.id] ?? "18:00");
  }
  function deletePost(post: Post) {
    if (!window.confirm("Delete this post from the library? This removes it from the board too."))
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
  // Copy this post's (possibly edited) content into an empty day this month.
  function addToDay(post: Post, day: number) {
    const target = dateStr(day);
    setSavingId(post.id);
    startTransition(async () => {
      try {
        await saveProoferPostAction(
          clientId,
          target,
          post.platform,
          captions[post.id] ?? post.caption,
          media[post.id] ?? [],
          pillar.id,
          post.linkedIdeaId,
          post.linkedIdeaKind,
          times[post.id] ?? post.publishTime,
          post.publishTargets
        );
        setPickFor(null);
        router.refresh();
      } finally {
        setSavingId(null);
      }
    });
  }

  const visible = ordered.filter((p) => !deleted.has(p.id));

  return (
    <div>
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
            {visible.length} post{visible.length === 1 ? "" : "s"} · all time · this month first
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
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
            gap: 14,
            alignItems: "start",
          }}
        >
          {visible.map((post) => {
            const saving = savingId === post.id && isPending;
            const urls = media[post.id] ?? [];
            const platformLabel =
              PROOFER_PLATFORM_LABELS[post.platform as ProoferPlatform] ?? post.platform;
            const occupied = occupiedByPlatform.get(post.platform) ?? new Set<string>();
            const timeChanged = (times[post.id] ?? "") !== post.publishTime;
            const captionChanged = (captions[post.id] ?? "") !== post.caption;
            return (
              <div
                key={post.id}
                style={{
                  border: "1px solid #e4e4e7",
                  borderRadius: 14,
                  background: "#fff",
                  padding: 14,
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                  opacity: saving ? 0.7 : 1,
                  position: "relative",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 12, fontWeight: 700 }}>{dayLabel(post.postDate)}</span>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: "#3f3f46",
                      background: "#f4f4f5",
                      borderRadius: 999,
                      padding: "2px 8px",
                    }}
                  >
                    {platformLabel}
                  </span>
                  <button
                    type="button"
                    onClick={() => deletePost(post)}
                    disabled={saving}
                    aria-label="Delete from library"
                    style={{
                      marginLeft: "auto",
                      border: "1px solid #fca5a5",
                      background: "#fff",
                      color: "#b3261e",
                      fontSize: 11,
                      fontWeight: 700,
                      borderRadius: 8,
                      padding: "5px 9px",
                      cursor: saving ? "wait" : "pointer",
                    }}
                  >
                    Delete
                  </button>
                </div>

                {/* Media */}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  {urls.map((url) => (
                    <div key={url} style={{ position: "relative", width: 72, height: 72 }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={url}
                        alt=""
                        style={{
                          width: 72,
                          height: 72,
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
                          top: 3,
                          right: 3,
                          width: 20,
                          height: 20,
                          borderRadius: "50%",
                          border: "none",
                          background: "rgba(0,0,0,0.6)",
                          color: "#fff",
                          fontSize: 12,
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
                    label="＋ Add"
                    accept="image/*,video/*"
                  />
                </div>

                {/* Caption */}
                <textarea
                  value={captions[post.id] ?? ""}
                  onChange={(e) => setCaptions((c) => ({ ...c, [post.id]: e.target.value }))}
                  rows={3}
                  placeholder="Write a caption…"
                  style={{
                    width: "100%",
                    resize: "vertical",
                    border: "1px solid #e4e4e7",
                    borderRadius: 10,
                    padding: "9px 11px",
                    fontSize: 13,
                    lineHeight: 1.5,
                    color: "#18181b",
                    fontFamily: "inherit",
                    minHeight: 66,
                  }}
                />
                {captionChanged && (
                  <button type="button" onClick={() => saveCaption(post)} disabled={saving} style={darkBtn}>
                    Save text
                  </button>
                )}

                {/* Reschedule + add-to-a-day */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: "auto" }}>
                  <input
                    type="time"
                    value={times[post.id] ?? ""}
                    onChange={(e) => setTimes((t) => ({ ...t, [post.id]: e.target.value }))}
                    aria-label="Publish time"
                    style={{
                      border: "1px solid #e4e4e7",
                      borderRadius: 8,
                      padding: "6px 8px",
                      fontSize: 12,
                      fontWeight: 600,
                      color: "#18181b",
                      fontFamily: "inherit",
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => reschedule(post)}
                    disabled={saving || !timeChanged}
                    style={{ ...ghostBtn, opacity: timeChanged ? 1 : 0.5 }}
                  >
                    Reschedule
                  </button>
                  <div style={{ position: "relative", marginLeft: "auto" }}>
                    <button
                      type="button"
                      onClick={() => setPickFor(pickFor === post.id ? null : post.id)}
                      disabled={saving}
                      style={accentBtn}
                    >
                      📅 Add to a day
                    </button>
                    {pickFor === post.id && (
                      <>
                        <div
                          aria-hidden
                          onClick={() => setPickFor(null)}
                          style={{ position: "fixed", inset: 0, zIndex: 40 }}
                        />
                        <div style={calPopup} role="dialog" aria-label="Choose an empty day">
                          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8, color: "#18181b" }}>
                            Add to an empty day
                          </div>
                          <div style={calGrid}>
                            {WEEKDAYS.map((w, i) => (
                              <div key={`w${i}`} style={{ fontSize: 10, fontWeight: 700, color: "#a1a1aa", textAlign: "center" }}>
                                {w}
                              </div>
                            ))}
                            {monthCells.map((d, i) =>
                              d === null ? (
                                <div key={`b${i}`} />
                              ) : (
                                (() => {
                                  const taken = occupied.has(dateStr(d));
                                  return (
                                    <button
                                      key={d}
                                      type="button"
                                      disabled={taken || saving}
                                      onClick={() => addToDay(post, d)}
                                      title={taken ? "Already has a post" : "Add here"}
                                      style={{
                                        height: 30,
                                        borderRadius: 7,
                                        border: "1px solid",
                                        borderColor: taken ? "transparent" : "#c3edd0",
                                        background: taken ? "#f4f4f5" : "#effaf6",
                                        color: taken ? "#c4c4cc" : "#1f6b5c",
                                        fontSize: 12,
                                        fontWeight: 700,
                                        cursor: taken ? "default" : "pointer",
                                      }}
                                    >
                                      {d}
                                    </button>
                                  );
                                })()
                              )
                            )}
                          </div>
                          <div style={{ fontSize: 11, color: "#a1a1aa", marginTop: 8 }}>
                            Green days are empty ({month}). Copies this post there.
                          </div>
                        </div>
                      </>
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

const darkBtn: React.CSSProperties = {
  alignSelf: "flex-start",
  border: "1px solid #18181b",
  background: "#18181b",
  color: "#fff",
  fontSize: 12,
  fontWeight: 700,
  borderRadius: 8,
  padding: "7px 12px",
  cursor: "pointer",
};
const ghostBtn: React.CSSProperties = {
  border: "1px solid #e4e4e7",
  background: "#fff",
  color: "#3f3f46",
  fontSize: 12,
  fontWeight: 700,
  borderRadius: 8,
  padding: "7px 11px",
  cursor: "pointer",
};
const accentBtn: React.CSSProperties = {
  border: "1px solid #99e2d0",
  background: "#effaf6",
  color: "#1f6b5c",
  fontSize: 12,
  fontWeight: 700,
  borderRadius: 8,
  padding: "7px 11px",
  cursor: "pointer",
  whiteSpace: "nowrap",
};
const calPopup: React.CSSProperties = {
  position: "absolute",
  top: "calc(100% + 6px)",
  right: 0,
  zIndex: 41,
  width: 250,
  background: "#fff",
  border: "1px solid #e4e4e7",
  borderRadius: 12,
  boxShadow: "0 12px 32px rgba(0,0,0,0.18)",
  padding: 12,
};
const calGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(7, 1fr)",
  gap: 4,
};
