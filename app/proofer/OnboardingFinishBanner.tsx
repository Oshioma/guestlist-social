"use client";

import { useCallback, useEffect, useState } from "react";

// Shown on the board right after the guided tour finishes (?tour=done). Instead
// of a static banner up top, it spotlights the actual post the user just made:
// it scrolls to that day, cuts a bright "hole" around it while dimming the rest
// of the board, and floats the explanation next to it — so they literally see
// their saved post in the background. Falls back to a plain top banner if the
// day can't be located. Dismissible.
export default function OnboardingFinishBanner({
  dateLabel,
  date,
}: {
  dateLabel: string | null;
  date: string | null;
}) {
  const [open, setOpen] = useState(true);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [located, setLocated] = useState(false);

  const targetId = date ? `day-${date}` : null;

  // Find the post's day card, scroll it into view, and measure it.
  useEffect(() => {
    if (!open || !targetId) {
      setLocated(true);
      return;
    }
    let raf = 0;
    let tries = 0;
    let settleTimer = 0;
    const tryLocate = () => {
      const el = document.getElementById(targetId);
      if (el) {
        el.scrollIntoView({ block: "center", behavior: "smooth" });
        settleTimer = window.setTimeout(() => {
          setRect(el.getBoundingClientRect());
          setLocated(true);
        }, 420);
        return;
      }
      if (tries++ > 90) {
        setLocated(true); // ~1.5s — give up, use the fallback banner
        return;
      }
      raf = requestAnimationFrame(tryLocate);
    };
    tryLocate();
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(settleTimer);
    };
  }, [open, targetId]);

  // Keep the hole aligned while the user scrolls or resizes.
  useEffect(() => {
    if (!rect || !targetId) return;
    const update = () => {
      const el = document.getElementById(targetId);
      if (el) setRect(el.getBoundingClientRect());
    };
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [rect, targetId]);

  const dismiss = useCallback(() => setOpen(false), []);

  if (!open) return null;

  const banner = (
    <div style={cardStyle} className="ob-fb-pop">
      <div style={{ fontSize: 26, lineHeight: 1 }}>🎉</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: "#18181b" }}>
          Here&apos;s your first post
        </div>
        <div style={{ fontSize: 13.5, color: "#3f3f46", marginTop: 3, lineHeight: 1.45 }}>
          It&apos;s saved{dateLabel ? ` for ${dateLabel}` : ""} — right here on your board, and we did
          NOT schedule it. Tap it to reopen or edit. <strong style={{ color: "#854d0e" }}>🟡 Yellow = Saved</strong> ·{" "}
          <strong style={{ color: "#166534" }}>🟢 Green = Scheduled</strong>. Mark it green whenever
          you&apos;re happy for it to go out — nothing posts on its own.
        </div>
        <button type="button" onClick={dismiss} style={gotItStyle}>
          Got it
        </button>
      </div>
      <button type="button" onClick={dismiss} style={dismissStyle} aria-label="Dismiss">
        ✕
      </button>
    </div>
  );

  // Still trying to locate the card — render nothing to avoid a flash.
  if (!rect && !located) return null;

  // Couldn't find the card → plain top banner (original behavior).
  if (!rect) {
    return (
      <>
        <style>{popKeyframes}</style>
        <div style={{ ...cardStyle, marginBottom: 16 }} className="ob-fb-pop">
          <div style={{ fontSize: 26, lineHeight: 1 }}>🎉</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: "#18181b" }}>
              Here&apos;s your first post
            </div>
            <div style={{ fontSize: 13.5, color: "#3f3f46", marginTop: 3, lineHeight: 1.45 }}>
              It&apos;s saved{dateLabel ? ` for ${dateLabel}` : ""} on your board below (we did NOT
              schedule it). Tap it to reopen or edit. <strong style={{ color: "#854d0e" }}>🟡 Yellow = Saved</strong> ·{" "}
              <strong style={{ color: "#166534" }}>🟢 Green = Scheduled</strong>.
            </div>
          </div>
          <button type="button" onClick={dismiss} style={dismissStyle} aria-label="Dismiss">
            ✕
          </button>
        </div>
      </>
    );
  }

  // Spotlight geometry.
  const pad = 8;
  const holeTop = rect.top - pad;
  const holeLeft = rect.left - pad;
  const holeW = rect.width + pad * 2;
  const holeH = rect.height + pad * 2;

  // Prefer placing the card to the RIGHT of the post (there's usually empty
  // board there); otherwise fall back to above/below, horizontally centred.
  const gap = 16;
  const rightRoom = window.innerWidth - (rect.right + gap) - 16;
  const placeRight = rightRoom >= 300;

  let bannerPos: React.CSSProperties;
  if (placeRight) {
    bannerPos = {
      left: rect.right + gap,
      top: Math.max(12, Math.min(holeTop, window.innerHeight - 300)),
      width: Math.min(420, rightRoom),
    };
  } else {
    const placeBelow = rect.top + rect.height / 2 < window.innerHeight * 0.5;
    bannerPos = {
      left: "50%",
      transform: "translateX(-50%)",
      width: "min(560px, calc(100vw - 24px))",
      ...(placeBelow
        ? { top: Math.min(holeTop + holeH + 14, window.innerHeight - 20) }
        : { bottom: Math.min(window.innerHeight - holeTop + 14, window.innerHeight - 20) }),
    };
  }

  return (
    <>
      <style>{popKeyframes}</style>
      {/* Click-catcher: tap anywhere (incl. the post) to dismiss and use the board. */}
      <div onClick={dismiss} style={catcherStyle} aria-hidden />
      {/* The bright hole + dim surround (box-shadow trick). Non-interactive so
          the post shows through and taps fall to the catcher. */}
      <div
        aria-hidden
        style={{
          position: "fixed",
          top: holeTop,
          left: holeLeft,
          width: holeW,
          height: holeH,
          borderRadius: 14,
          boxShadow: "0 0 0 9999px rgba(24,24,27,0.55)",
          outline: "2.5px solid #7c3aed",
          outlineOffset: 0,
          pointerEvents: "none",
          zIndex: 1001,
          transition: "top 120ms ease, left 120ms ease",
        }}
      />
      {/* The explanation, floating beside the post. */}
      <div
        style={{
          position: "fixed",
          zIndex: 1002,
          ...bannerPos,
        }}
      >
        {banner}
      </div>
    </>
  );
}

const popKeyframes = `@keyframes ob-fb-pop{0%{opacity:0;transform:scale(.97)}100%{opacity:1;transform:scale(1)}}.ob-fb-pop{animation:ob-fb-pop .28s ease both}`;

const cardStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 14,
  background: "linear-gradient(180deg,#faf5ff,#ffffff)",
  border: "1px solid #ddd6fe",
  borderRadius: 14,
  padding: "14px 16px",
  boxShadow: "0 18px 44px -14px rgba(24,24,27,.45)",
};

const catcherStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 1000,
  cursor: "pointer",
};

const gotItStyle: React.CSSProperties = {
  marginTop: 10,
  background: "#6d28d9",
  color: "#fff",
  border: "none",
  borderRadius: 9,
  padding: "8px 16px",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
};

const dismissStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "#a1a1aa",
  cursor: "pointer",
  fontSize: 14,
  fontWeight: 700,
  padding: 4,
  lineHeight: 1,
};
