"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import NotificationsBell from "../admin-panel/components/NotificationsBell";

type ClientLite = { id: string; name: string };
type PillarLite = { id: string; name: string; color: string };
type PostLite = {
  id: string;
  postDate: string;
  caption: string;
  mediaUrls: string[];
  pillarId: string | null;
  platform: string;
};

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

function dayLabel(postDate: string): string {
  const [y, m, d] = postDate.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return postDate;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// Standalone top navigation for /proofer. Carries the Client dropdown, the
// Month stepper and the content-pillar chips (hovering a pillar reveals the
// posts filed under it), plus a quiet link back to the Guestlist dashboard.
export default function ProoferNav({
  clients,
  clientId,
  month,
  pillars,
  posts,
}: {
  clients: ClientLite[];
  clientId: string;
  month: string;
  pillars: PillarLite[];
  posts: PostLite[];
}) {
  const router = useRouter();
  const [hoverPillar, setHoverPillar] = useState<string | null>(null);

  const go = (c: string, m: string) =>
    router.push(
      `/proofer?client=${encodeURIComponent(c)}&month=${encodeURIComponent(m)}`
    );

  // Posts filed under each pillar — powers the hover popup. Ordered so the same
  // calendar month as the one on screen (from any year) surfaces first, newest
  // first within each group: viewing August, last August's posts come up top.
  const viewedMonth = Number(month.split("-")[1]) || 0;
  const postsByPillar = useMemo(() => {
    const map = new Map<string, PostLite[]>();
    for (const p of posts) {
      if (!p.pillarId) continue;
      const arr = map.get(p.pillarId) ?? [];
      arr.push(p);
      map.set(p.pillarId, arr);
    }
    const sameMonth = (d: string) =>
      Number(d.slice(5, 7)) === viewedMonth ? 0 : 1;
    for (const arr of map.values()) {
      arr.sort((a, b) => {
        const ra = sameMonth(a.postDate);
        const rb = sameMonth(b.postDate);
        if (ra !== rb) return ra - rb; // this-month posts first
        return b.postDate.localeCompare(a.postDate); // then newest first
      });
    }
    return map;
  }, [posts, viewedMonth]);

  const ctlBg = "rgba(255,255,255,0.06)";
  const ctlBorder = "1px solid rgba(255,255,255,0.12)";

  return (
    <header
      style={{
        background: "#35353c",
        color: "#fff",
        display: "flex",
        alignItems: "center",
        gap: 16,
        rowGap: 10,
        flexWrap: "wrap",
        padding: "10px 20px",
        flexShrink: 0,
        position: "relative",
        zIndex: 30,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
        <div
          aria-hidden
          style={{
            width: 30,
            height: 30,
            borderRadius: 8,
            background: "#b8e3d8",
            color: "#1f6b5c",
            display: "grid",
            placeItems: "center",
            fontWeight: 800,
            fontSize: 15,
          }}
        >
          P
        </div>
        <div>
          <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: "-0.01em", lineHeight: 1 }}>
            Proofer
          </div>
          <Link
            href="/app/dashboard"
            target="_blank"
            rel="noopener"
            title="Open Guestlist dashboard in a new tab"
            style={{
              display: "inline-block",
              fontSize: 10,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "#b8e3d8",
              fontWeight: 700,
              marginTop: 3,
              textDecoration: "none",
            }}
          >
            Guestlist Social ↗
          </Link>
        </div>
      </div>

      {/* Client + Month controls */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <select
          aria-label="Client"
          value={clientId}
          onChange={(e) => go(e.target.value, month)}
          disabled={clients.length === 0}
          style={{
            appearance: "none",
            WebkitAppearance: "none",
            background: ctlBg,
            border: ctlBorder,
            borderRadius: 9,
            color: "#fff",
            fontSize: 13,
            fontWeight: 600,
            padding: "8px 12px",
            cursor: clients.length === 0 ? "default" : "pointer",
            maxWidth: 220,
          }}
        >
          {clients.length === 0 && <option value="">No clients</option>}
          {clients.map((c) => (
            <option key={c.id} value={c.id} style={{ color: "#18181b" }}>
              {c.name}
            </option>
          ))}
        </select>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 2,
            background: ctlBg,
            border: ctlBorder,
            borderRadius: 9,
            padding: "3px 4px",
          }}
        >
          <button type="button" aria-label="Previous month" onClick={() => go(clientId, shiftMonth(month, -1))} style={monthBtn}>
            ‹
          </button>
          {/* Clicking the month label returns to the board's month view (handy
              from the pillar Organise page). */}
          <button
            type="button"
            onClick={() => go(clientId, month)}
            title="Back to the month board"
            style={{
              border: "none",
              background: "transparent",
              color: "#fff",
              fontSize: 13,
              fontWeight: 700,
              padding: "0 8px",
              minWidth: 96,
              textAlign: "center",
              cursor: "pointer",
            }}
          >
            {monthLabel(month)}
          </button>
          <button type="button" aria-label="Next month" onClick={() => go(clientId, shiftMonth(month, 1))} style={monthBtn}>
            ›
          </button>
        </div>
      </div>

      {/* Content pillars — hover a chip to see the posts filed under it */}
      {pillars.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          {pillars.map((p) => {
            const pillarPosts = postsByPillar.get(p.id) ?? [];
            const open = hoverPillar === p.id;
            return (
              <div
                key={p.id}
                style={{ position: "relative" }}
                onMouseEnter={() => setHoverPillar(p.id)}
                onMouseLeave={() =>
                  setHoverPillar((cur) => (cur === p.id ? null : cur))
                }
              >
                <button type="button" style={pillarChip}>
                  <span
                    aria-hidden
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: "50%",
                      background: p.color || "#a1a1aa",
                      flexShrink: 0,
                    }}
                  />
                  {p.name}
                </button>
                {open && (
                  <div style={pillarPopupOuter}>
                    <div style={pillarPopupCard} role="dialog" aria-label={`${p.name} posts`}>
                    <div style={popupHeader}>
                      <span
                        aria-hidden
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: "50%",
                          background: p.color || "#a1a1aa",
                        }}
                      />
                      <span style={{ fontWeight: 800 }}>{p.name}</span>
                      <span style={{ color: "#a1a1aa", fontWeight: 600 }}>
                        {pillarPosts.length} post{pillarPosts.length === 1 ? "" : "s"} · all time
                      </span>
                      <Link
                        href={`/proofer/pillars/${p.id}?client=${encodeURIComponent(clientId)}&month=${encodeURIComponent(month)}`}
                        style={{
                          marginLeft: "auto",
                          fontSize: 12,
                          fontWeight: 700,
                          color: "#1f6b5c",
                          background: "#b8e3d8",
                          borderRadius: 8,
                          padding: "5px 10px",
                          textDecoration: "none",
                          whiteSpace: "nowrap",
                        }}
                      >
                        Organise →
                      </Link>
                    </div>
                    {pillarPosts.length === 0 ? (
                      <div style={{ padding: "12px 14px", fontSize: 13, color: "#71717a" }}>
                        No posts in this pillar yet.
                      </div>
                    ) : (
                      <div style={{ maxHeight: 320, overflowY: "auto" }}>
                        {pillarPosts.map((post) => (
                          <div key={post.id} style={popupRow}>
                            <div
                              style={{
                                width: 40,
                                height: 40,
                                borderRadius: 8,
                                flexShrink: 0,
                                background: post.mediaUrls[0] ? "#f4f4f5" : "#ececee",
                                overflow: "hidden",
                              }}
                            >
                              {post.mediaUrls[0] && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={post.mediaUrls[0]}
                                  alt=""
                                  style={{ width: 40, height: 40, objectFit: "cover", display: "block" }}
                                />
                              )}
                            </div>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: 11, fontWeight: 700, color: "#71717a" }}>
                                {dayLabel(post.postDate)}
                              </div>
                              <div
                                style={{
                                  fontSize: 13,
                                  color: "#18181b",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                  maxWidth: 220,
                                }}
                              >
                                {post.caption.trim() || <span style={{ color: "#a1a1aa" }}>No caption</span>}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div style={{ flex: 1 }} />

      <NotificationsBell />
      <form action="/sign-out" method="post" style={{ margin: 0 }}>
        <button
          type="submit"
          style={{
            background: "transparent",
            border: "1px solid rgba(255,255,255,0.18)",
            borderRadius: 8,
            padding: "6px 10px",
            fontSize: 12,
            color: "#d4d4d8",
            cursor: "pointer",
          }}
        >
          Sign out
        </button>
      </form>
      <div
        aria-hidden
        style={{
          width: 32,
          height: 32,
          borderRadius: "50%",
          background: "#b8e3d8",
          color: "#1f6b5c",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 13,
          fontWeight: 800,
        }}
      >
        GS
      </div>
    </header>
  );
}

const monthBtn: React.CSSProperties = {
  width: 26,
  height: 26,
  border: "none",
  background: "transparent",
  color: "#cfcfd6",
  fontSize: 16,
  lineHeight: 1,
  borderRadius: 7,
  cursor: "pointer",
};

const pillarChip: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 7,
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 999,
  color: "#fff",
  fontSize: 12,
  fontWeight: 600,
  padding: "6px 12px",
  cursor: "default",
  whiteSpace: "nowrap",
};

const pillarPopupOuter: React.CSSProperties = {
  position: "absolute",
  top: "100%",
  left: 0,
  zIndex: 50,
  width: 300,
  // Transparent bridge so moving the mouse from the chip into the popup never
  // crosses a dead gap that would close it.
  paddingTop: 8,
};

const pillarPopupCard: React.CSSProperties = {
  background: "#fff",
  color: "#18181b",
  border: "1px solid #e4e4e7",
  borderRadius: 12,
  boxShadow: "0 12px 32px rgba(0,0,0,0.18)",
  overflow: "hidden",
};

const popupHeader: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "10px 14px",
  borderBottom: "1px solid #f4f4f5",
  fontSize: 12,
};

const popupRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "9px 14px",
  borderTop: "1px solid #f7f7f8",
};
