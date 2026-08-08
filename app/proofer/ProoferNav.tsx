"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import NotificationsBell from "../admin-panel/components/NotificationsBell";

type ClientLite = { id: string; name: string };
type TeamLite = { id: string; name: string; isOwner: boolean };
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

// Standalone top navigation for /proofer. The logo reveals an account menu
// (Clients, Sign out) on hover; client/month sit on the left, pillars on the
// right; a "Powered by Guestlist Social" strip (linking to the dashboard) sits
// beneath the bar.
export default function ProoferNav({
  clients,
  clientId,
  month,
  pillars,
  posts,
  // Teams the current user belongs to, for the switcher in the brand menu.
  teams = [],
  // Prefix the Proofer routes live under ("" on the standalone domain, where
  // the board sits at the root; "/proofer" otherwise). See app/proofer/base.ts.
  base = "/proofer",
  // Absolute origin of the parent Guestlist app for links that leave Proofer.
  // Empty on the normal host, where those links stay relative.
  parentOrigin = "",
}: {
  clients: ClientLite[];
  clientId: string;
  month: string;
  pillars: PillarLite[];
  posts: PostLite[];
  teams?: TeamLite[];
  base?: string;
  parentOrigin?: string;
}) {
  const router = useRouter();
  const [hoverPillar, setHoverPillar] = useState<string | null>(null);
  const [brandMenu, setBrandMenu] = useState(false);
  // Hide the floating nav when scrolling down; reveal it on the slightest
  // scroll up (smooth fade/slide via the transition below).
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    let lastY = window.scrollY;
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = window.scrollY;
        if (y > lastY + 4 && y > 120) setHidden(true);
        else if (y < lastY - 2) setHidden(false);
        lastY = y;
        ticking = false;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // The board home — "/" on the standalone domain, "/proofer" otherwise.
  const home = base || "/";

  const go = (c: string, m: string) =>
    router.push(
      `${home}?client=${encodeURIComponent(c)}&month=${encodeURIComponent(m)}`
    );

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
        if (ra !== rb) return ra - rb;
        return b.postDate.localeCompare(a.postDate);
      });
    }
    return map;
  }, [posts, viewedMonth]);

  const ctlBg = "rgba(255,255,255,0.06)";
  const ctlBorder = "1px solid rgba(255,255,255,0.12)";
  const qs = `client=${encodeURIComponent(clientId)}&month=${encodeURIComponent(month)}`;

  return (
    <div
      style={{
        position: "sticky",
        top: 0,
        zIndex: 40,
        transform: hidden ? "translateY(-100%)" : "translateY(0)",
        opacity: hidden ? 0 : 1,
        transition: "transform 300ms ease, opacity 300ms ease",
      }}
    >
      <header
        style={{
          background: "#35353c",
          color: "#fff",
          display: "flex",
          alignItems: "center",
          gap: 16,
          rowGap: 10,
          flexWrap: "wrap",
          padding: "18px 20px 12px",
          flexShrink: 0,
          position: "relative",
          zIndex: 30,
        }}
      >
        {/* Brand + hover account menu */}
        <div
          style={{ position: "relative" }}
          onMouseEnter={() => setBrandMenu(true)}
          onMouseLeave={() => setBrandMenu(false)}
        >
          <div
            role="button"
            tabIndex={0}
            aria-haspopup="menu"
            aria-expanded={brandMenu}
            onClick={() => setBrandMenu((v) => !v)}
            style={{ display: "flex", alignItems: "center", gap: 13, cursor: "pointer" }}
          >
            <div
              aria-hidden
              style={{
                width: 42,
                height: 42,
                borderRadius: 11,
                background: "#b8e3d8",
                color: "#1f6b5c",
                display: "grid",
                placeItems: "center",
                fontWeight: 800,
                fontSize: 20,
              }}
            >
              P
            </div>
            <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1 }}>
              Proofer
            </div>
            <span aria-hidden style={{ color: "#a1a1aa", fontSize: 11, marginLeft: 2 }}>▾</span>
          </div>

          {brandMenu && (
            <>
              {/* Tap-away catcher (touch has no hover) */}
              <div
                aria-hidden
                onClick={() => setBrandMenu(false)}
                style={{ position: "fixed", inset: 0, zIndex: 55 }}
              />
            <div style={{ position: "absolute", top: "100%", left: 0, paddingTop: 8, zIndex: 60 }}>
              <div
                style={{
                  background: "#fff",
                  color: "#18181b",
                  border: "1px solid #e4e4e7",
                  borderRadius: 12,
                  boxShadow: "0 12px 32px rgba(0,0,0,0.18)",
                  overflow: "hidden",
                  minWidth: 190,
                }}
              >
                <Link href={`${base}/pillars?${qs}`} style={menuItem}>
                  ＋ Add pillar
                </Link>
                <Link href={`${base}/clients?${qs}`} style={{ ...menuItem, borderTop: "1px solid #f4f4f5" }}>
                  👥 Clients
                </Link>
                <div style={{ borderTop: "1px solid #f4f4f5", padding: "9px 15px 4px" }}>
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      color: "#a1a1aa",
                    }}
                  >
                    Teams
                  </div>
                </div>
                {teams.length === 0 ? (
                  <span style={{ ...menuItem, color: "#a1a1aa", fontWeight: 500 }}>
                    No teams yet
                  </span>
                ) : (
                  <div style={{ maxHeight: 220, overflowY: "auto" }}>
                    {teams.map((t) => (
                      <Link
                        key={t.id}
                        href={`${base}/teams/${t.id}`}
                        style={{ ...menuItem, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}
                      >
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          🏷️ {t.name}
                        </span>
                        {t.isOwner && (
                          <span style={{ fontSize: 10, fontWeight: 700, color: "#9d2b5b", flexShrink: 0 }}>
                            My team
                          </span>
                        )}
                      </Link>
                    ))}
                  </div>
                )}
                <Link
                  href={`${base}/teams`}
                  style={{ ...menuItem, borderTop: "1px solid #f4f4f5", fontSize: 13, color: "#52525b" }}
                >
                  Manage all teams →
                </Link>
                {clientId && (
                  <Link
                    href={`${parentOrigin}/portal/${encodeURIComponent(clientId)}`}
                    target="_blank"
                    rel="noopener"
                    style={{ ...menuItem, borderTop: "1px solid #f4f4f5" }}
                  >
                    👁 Client view ↗
                  </Link>
                )}
                <form action="/sign-out" method="post" style={{ margin: 0 }}>
                  <button type="submit" style={{ ...menuItem, width: "100%", textAlign: "left", background: "transparent", border: "none", borderTop: "1px solid #f4f4f5", cursor: "pointer" }}>
                    Sign out
                  </button>
                </form>
              </div>
            </div>
            </>
          )}
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

        {/* Push pillars to the right */}
        <div style={{ flex: 1 }} />

        {/* Content pillars — hover a chip to see the posts filed under it */}
        {pillars.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
            {pillars.map((p) => {
              const pillarPosts = postsByPillar.get(p.id) ?? [];
              const open = hoverPillar === p.id;
              return (
                <div
                  key={p.id}
                  style={{ position: "relative" }}
                  onMouseEnter={() => setHoverPillar(p.id)}
                  onMouseLeave={() => setHoverPillar((cur) => (cur === p.id ? null : cur))}
                >
                  <button type="button" style={pillarChip}>
                    <span
                      aria-hidden
                      style={{ width: 10, height: 10, borderRadius: "50%", background: p.color || "#a1a1aa", flexShrink: 0 }}
                    />
                    {p.name}
                  </button>
                  {open && (
                    <div style={pillarPopupOuter}>
                      <div style={pillarPopupCard} role="dialog" aria-label={`${p.name} posts`}>
                        <div style={popupHeader}>
                          <span aria-hidden style={{ width: 10, height: 10, borderRadius: "50%", background: p.color || "#a1a1aa" }} />
                          <span style={{ fontWeight: 800 }}>{p.name}</span>
                          <span style={{ color: "#a1a1aa", fontWeight: 600 }}>
                            {pillarPosts.length} post{pillarPosts.length === 1 ? "" : "s"} · all time
                          </span>
                          <Link
                            href={`${base}/pillars/${p.id}?${qs}`}
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
                          <div style={{ maxHeight: 460, overflowY: "auto" }}>
                            {pillarPosts.map((post) => (
                              <div key={post.id} style={popupRow}>
                                <div
                                  style={{
                                    width: 96,
                                    height: 96,
                                    borderRadius: 10,
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
                                      style={{ width: 96, height: 96, objectFit: "cover", display: "block" }}
                                    />
                                  )}
                                </div>
                                <div style={{ minWidth: 0 }}>
                                  <div style={{ fontSize: 12, fontWeight: 700, color: "#71717a" }}>
                                    {dayLabel(post.postDate)}
                                  </div>
                                  <div
                                    style={{
                                      fontSize: 13,
                                      color: "#18181b",
                                      lineHeight: 1.45,
                                      marginTop: 3,
                                      display: "-webkit-box",
                                      WebkitLineClamp: 3,
                                      WebkitBoxOrient: "vertical",
                                      overflow: "hidden",
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
        <NotificationsBell />
      </header>

      {/* Powered-by strip — light band under the dark nav */}
      <div
        style={{
          background: "#eceef1",
          color: "#52525b",
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.02em",
          padding: "6px 20px",
          borderBottom: "1px solid #dcdee2",
          display: "flex",
          alignItems: "center",
          gap: 6,
          flexShrink: 0,
        }}
      >
        Powered by
        <Link
          href={`${parentOrigin}/app/dashboard`}
          target="_blank"
          rel="noopener"
          title="Open Guestlist dashboard in a new tab"
          style={{ color: "#1d4ed8", textDecoration: "none", fontWeight: 800 }}
        >
          Guestlist Social ↗
        </Link>
      </div>
    </div>
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

const menuItem: React.CSSProperties = {
  display: "block",
  padding: "11px 15px",
  fontSize: 14,
  fontWeight: 600,
  color: "#18181b",
  textDecoration: "none",
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
  right: 0,
  zIndex: 50,
  width: 460,
  maxWidth: "92vw",
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
  alignItems: "flex-start",
  gap: 12,
  padding: "11px 14px",
  borderTop: "1px solid #f7f7f8",
};
