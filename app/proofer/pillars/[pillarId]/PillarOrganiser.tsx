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
function shiftMonth(value: string, delta: number): string {
  const [y, m] = value.split("-").map(Number);
  if (!y || !m) return value;
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function monthLabel(value: string): string {
  const [y, m] = value.split("-").map(Number);
  if (!y || !m) return value;
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}
const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

// Media in a post can be an image, an uploaded video (kept with its original
// .mp4/.mov/etc. extension by uploadToStorage), or a Google Drive video. A
// plain <img> can only render the first — the others 404 into a broken-image
// icon — so mirror the board's detection and pick the right element.
function isDriveVideo(url: string): boolean {
  return /drive\.google\.com\/uc\?/.test(url);
}
function driveVideoFileId(url: string): string | null {
  const m = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
}
function driveThumbUrl(url: string): string | null {
  const id = driveVideoFileId(url);
  return id ? `https://drive.google.com/thumbnail?id=${id}&sz=w400` : null;
}
function isVideoUrl(url: string): boolean {
  if (/\.(mp4|mov|webm|m4v|ogv)(\?|$)/i.test(url)) return true;
  if (isDriveVideo(url)) return true;
  return false;
}

export default function PillarOrganiser({
  clientId,
  pillar,
  month,
  posts,
  occupiedDates,
  // Prefix the Proofer routes live under ("" on the standalone domain, where
  // the board sits at the root; "/proofer" otherwise). See app/proofer/base.ts.
  base = "/proofer",
}: {
  clientId: string;
  pillar: { id: string; name: string; color: string };
  month: string;
  posts: Post[];
  occupiedDates: string[];
  base?: string;
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
  const [pickFor, setPickFor] = useState<string | null>(null);
  const [pickMonth, setPickMonth] = useState<string>(month);

  const occupied = useMemo(() => new Set(occupiedDates), [occupiedDates]);

  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

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

  // Calendar cells for the month currently shown in the picker.
  const [cy, cm] = pickMonth.split("-").map(Number);
  const monthCells = useMemo(() => {
    if (!cy || !cm) return [] as (number | null)[];
    const lead = new Date(cy, cm - 1, 1).getDay();
    const total = new Date(cy, cm, 0).getDate();
    const cells: (number | null)[] = Array(lead).fill(null);
    for (let d = 1; d <= total; d++) cells.push(d);
    return cells;
  }, [cy, cm]);
  const dateStr = (d: number) =>
    `${cy}-${String(cm).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

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
  // Copy this post's (possibly edited) content into a future empty day, then
  // jump to that month's board to see the new (yellow / not-yet-approved) post.
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
          post.publishTime,
          post.publishTargets
        );
        setPickFor(null);
        router.push(
          `${base || "/"}?client=${encodeURIComponent(clientId)}&month=${encodeURIComponent(pickMonth)}`
        );
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

                {/* Media — large previews */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns:
                      urls.length > 1 ? "repeat(2, 1fr)" : "1fr",
                    gap: 8,
                  }}
                >
                  {urls.map((url) => (
                    <div
                      key={url}
                      style={{ position: "relative", width: "100%", aspectRatio: "1 / 1" }}
                    >
                      {isDriveVideo(url) ? (
                        // Drive videos can't be embedded in <video>; show their
                        // thumbnail instead (matches the board's preview).
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={driveThumbUrl(url) ?? ""}
                          alt=""
                          style={mediaStyle}
                        />
                      ) : isVideoUrl(url) ? (
                        <video
                          src={url}
                          controls
                          playsInline
                          preload="metadata"
                          style={mediaStyle}
                        />
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={url} alt="" style={mediaStyle} />
                      )}
                      <button
                        type="button"
                        onClick={() => removeImage(post, url)}
                        disabled={saving}
                        aria-label="Remove image"
                        style={{
                          position: "absolute",
                          top: 8,
                          right: 8,
                          width: 26,
                          height: 26,
                          borderRadius: "50%",
                          border: "none",
                          background: "rgba(0,0,0,0.6)",
                          color: "#fff",
                          fontSize: 14,
                          lineHeight: 1,
                          cursor: saving ? "wait" : "pointer",
                        }}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
                <div>
                  <ImageUpload
                    bucket="postimages"
                    folder={`proofer/${clientId}/${post.postDate.slice(0, 7)}`}
                    onUploaded={(url) => addImage(post, url)}
                    label="＋ Add image"
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

                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: "auto" }}>
                  {captionChanged && (
                    <button type="button" onClick={() => saveCaption(post)} disabled={saving} style={darkBtn}>
                      Save text
                    </button>
                  )}
                  <div style={{ position: "relative", marginLeft: "auto" }}>
                    <button
                      type="button"
                      onClick={() => {
                        setPickMonth(month);
                        setPickFor(pickFor === post.id ? null : post.id);
                      }}
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
                        <div style={calPopup} role="dialog" aria-label="Choose a future empty day">
                          <div style={{ display: "flex", alignItems: "center", gap: 2, marginBottom: 8 }}>
                            <button type="button" aria-label="Previous month" onClick={() => setPickMonth((m) => shiftMonth(m, -1))} style={calNavBtn}>
                              ‹
                            </button>
                            <span style={{ flex: 1, textAlign: "center", fontSize: 12, fontWeight: 800, color: "#18181b" }}>
                              {monthLabel(pickMonth)}
                            </span>
                            <button type="button" aria-label="Next month" onClick={() => setPickMonth((m) => shiftMonth(m, 1))} style={calNavBtn}>
                              ›
                            </button>
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
                                  const ds = dateStr(d);
                                  const taken = occupied.has(ds);
                                  const past = ds < todayStr;
                                  const disabled = taken || past || saving;
                                  return (
                                    <button
                                      key={d}
                                      type="button"
                                      disabled={disabled}
                                      onClick={() => addToDay(post, d)}
                                      title={
                                        taken ? "Already has a post" : past ? "In the past" : "Add here"
                                      }
                                      style={{
                                        height: 30,
                                        borderRadius: 7,
                                        border: "1px solid",
                                        borderColor: disabled ? "transparent" : "#99e2d0",
                                        background: taken ? "#f4f4f5" : past ? "#fafafa" : "#effaf6",
                                        color: disabled ? "#c4c4cc" : "#1f6b5c",
                                        fontSize: 12,
                                        fontWeight: 700,
                                        cursor: disabled ? "default" : "pointer",
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
                            Green days are free & upcoming — copies this post there.
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

const mediaStyle: React.CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
  borderRadius: 12,
  border: "1px solid #e4e4e7",
  display: "block",
  background: "#f4f4f5",
};
const darkBtn: React.CSSProperties = {
  border: "1px solid #18181b",
  background: "#18181b",
  color: "#fff",
  fontSize: 12,
  fontWeight: 700,
  borderRadius: 8,
  padding: "7px 12px",
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
const calNavBtn: React.CSSProperties = {
  width: 26,
  height: 26,
  border: "1px solid #e4e4e7",
  background: "#fff",
  color: "#52525b",
  fontSize: 15,
  borderRadius: 7,
  cursor: "pointer",
};
const calGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(7, 1fr)",
  gap: 4,
};
