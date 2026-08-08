"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import NotificationsBell from "../admin-panel/components/NotificationsBell";
import { moveProoferPostAction } from "../admin-panel/lib/proofer-actions";

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

// Monogram tile used in the brand dropdown — a lettered box in place of an
// icon (C for Clients, CV for Client view, a team's initial, etc.).
function Tile({ text, tone = "brand" }: { text: string; tone?: "brand" | "muted" }) {
  return (
    <span
      aria-hidden
      className={`pnav-tile pnav-tile--${tone}${text.length > 1 ? " pnav-tile--two" : ""}`}
    >
      {text}
    </span>
  );
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

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

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
  // Every date (all time) that already carries a post — used to grey out taken
  // days in the reschedule calendar so a move never overwrites another post.
  occupiedDates = [],
  // Only the platform owner sees the Super admin link.
  isSuperAdmin = false,
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
  occupiedDates?: string[];
  isSuperAdmin?: boolean;
  base?: string;
  parentOrigin?: string;
}) {
  const router = useRouter();
  const [hoverPillar, setHoverPillar] = useState<string | null>(null);
  const [brandMenu, setBrandMenu] = useState(false);
  // Reschedule calendar: which post's picker is open, and the month it shows.
  const [pickFor, setPickFor] = useState<string | null>(null);
  const [pickMonth, setPickMonth] = useState<string>(month);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
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

  // Remember the account you're viewing so that leaving and coming back to the
  // board resumes on the same one. The board pages read this cookie when no
  // ?client= is present; persisting it on every view (not just when the board's
  // own picker changes) means the nav switcher and plain navigation are
  // remembered too.
  useEffect(() => {
    if (clientId) {
      document.cookie = `proofer_last_client=${clientId};path=/;max-age=${60 * 60 * 24 * 365}`;
    }
  }, [clientId]);

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

  const occupied = useMemo(() => new Set(occupiedDates), [occupiedDates]);

  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  // Calendar cells for the month currently shown in the reschedule picker.
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

  // Move a post to the chosen day, then jump to that month's board to see it
  // (yellow / not-yet-approved). The server action keeps all its content and
  // scheduling settings — only the date changes.
  function reschedule(post: PostLite, day: number) {
    const target = dateStr(day);
    setSavingId(post.id);
    startTransition(async () => {
      try {
        await moveProoferPostAction(
          clientId,
          post.postDate,
          post.platform,
          target
        );
        setPickFor(null);
        setHoverPillar(null);
        router.push(
          `${home}?client=${encodeURIComponent(clientId)}&month=${encodeURIComponent(pickMonth)}`
        );
      } finally {
        setSavingId(null);
      }
    });
  }

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
                className="pnav-menu"
                style={{
                  background: "#fff",
                  color: "#18181b",
                  border: "1px solid #e6e6e9",
                  borderRadius: 16,
                  boxShadow: "0 18px 44px -14px rgba(16,24,40,0.30)",
                  minWidth: 250,
                }}
              >
                <Link href={`${base}/pillars?${qs}`} className="pnav-item">
                  <Tile text="+" />
                  <span className="pnav-label">Add pillar</span>
                </Link>

                <div className="pnav-section">Teams</div>
                {teams.length === 0 ? (
                  <span className="pnav-item" style={{ fontWeight: 500 }}>
                    <Tile text="—" tone="muted" />
                    <span className="pnav-label" style={{ color: "#a1a1aa" }}>
                      No teams yet
                    </span>
                  </span>
                ) : (
                  <div style={{ maxHeight: 232, overflowY: "auto" }}>
                    {teams.map((t) => (
                      <Link key={t.id} href={`${base}/teams/${t.id}`} className="pnav-item">
                        <Tile text={(t.name.trim()[0] || "T").toUpperCase()} />
                        <span className="pnav-label">{t.name}</span>
                      </Link>
                    ))}
                  </div>
                )}
                <Link
                  href={`${base}/teams`}
                  className="pnav-item"
                  style={{ color: "#52525b", fontSize: 13 }}
                >
                  <Tile text="→" tone="muted" />
                  <span className="pnav-label">Manage all teams</span>
                </Link>

                <hr className="pnav-sep" />

                <Link href={`${base}/clients?${qs}`} className="pnav-item">
                  <Tile text="C" />
                  <span className="pnav-label">Clients</span>
                </Link>
                <Link href={`${base}/publish?${qs}`} className="pnav-item">
                  <Tile text="PQ" />
                  <span className="pnav-label">Publish queue</span>
                </Link>
                {clientId && (
                  <Link
                    href={`${parentOrigin}/portal/${encodeURIComponent(clientId)}`}
                    target="_blank"
                    rel="noopener"
                    className="pnav-item"
                  >
                    <Tile text="CV" />
                    <span className="pnav-label">Client view ↗</span>
                  </Link>
                )}

                {isSuperAdmin && (
                  <Link href={`${base}/admin`} className="pnav-item">
                    <Tile text="SA" tone="muted" />
                    <span className="pnav-label">Super admin</span>
                  </Link>
                )}

                <hr className="pnav-sep" />

                <form action="/sign-out" method="post" style={{ margin: 0 }}>
                  <button type="submit" className="pnav-item pnav-signout">
                    <span className="pnav-label">Sign out</span>
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
              const pickPost = pillarPosts.find((pp) => pp.id === pickFor) ?? null;
              // Keep the popup mounted while one of its posts has the reschedule
              // calendar open, even if the pointer has left the chip.
              const open = hoverPillar === p.id || pickPost !== null;
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
                                <div style={{ minWidth: 0, flex: 1 }}>
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
                                <button
                                  type="button"
                                  aria-label="Reschedule to another day"
                                  title="Reschedule to another day"
                                  disabled={isPending}
                                  onClick={() => {
                                    setPickMonth(month);
                                    setPickFor((cur) =>
                                      cur === post.id ? null : post.id
                                    );
                                  }}
                                  style={{
                                    flexShrink: 0,
                                    alignSelf: "center",
                                    width: 34,
                                    height: 34,
                                    borderRadius: 9,
                                    border:
                                      pickFor === post.id
                                        ? "1px solid #1f6b5c"
                                        : "1px solid #e4e4e7",
                                    background:
                                      pickFor === post.id ? "#b8e3d8" : "#fff",
                                    color: "#1f6b5c",
                                    fontSize: 16,
                                    lineHeight: 1,
                                    cursor: isPending ? "wait" : "pointer",
                                  }}
                                >
                                  📅
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      {pickPost && (
                        <>
                          {/* Tap-away catcher closes the picker */}
                          <div
                            aria-hidden
                            onClick={() => setPickFor(null)}
                            style={{ position: "fixed", inset: 0, zIndex: 51 }}
                          />
                          <div style={calPopup} role="dialog" aria-label="Reschedule to another day">
                            <div style={{ fontSize: 12, fontWeight: 800, color: "#18181b", marginBottom: 6 }}>
                              Reschedule this post
                            </div>
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
                                    const isSelf = ds === pickPost.postDate.slice(0, 10);
                                    const taken = occupied.has(ds) && !isSelf;
                                    const past = ds < todayStr;
                                    const disabled = taken || past || isSelf || isPending;
                                    return (
                                      <button
                                        key={d}
                                        type="button"
                                        disabled={disabled}
                                        onClick={() => reschedule(pickPost, d)}
                                        title={
                                          isSelf
                                            ? "Already on this day"
                                            : taken
                                            ? "Already has a post"
                                            : past
                                            ? "In the past"
                                            : "Move here"
                                        }
                                        style={{
                                          height: 30,
                                          borderRadius: 7,
                                          border: "1px solid",
                                          borderColor: disabled ? "transparent" : "#99e2d0",
                                          background: isSelf ? "#e4e4e7" : taken ? "#f4f4f5" : past ? "#fafafa" : "#effaf6",
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
                              Green days are free & upcoming — moves this post there (not approved yet).
                            </div>
                          </div>
                        </>
                      )}
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

// The reschedule calendar sits just to the left of the pillar popup card, so it
// escapes the card's clipped, scrollable post list.
const calPopup: React.CSSProperties = {
  position: "absolute",
  top: 0,
  right: "calc(100% + 8px)",
  zIndex: 52,
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
