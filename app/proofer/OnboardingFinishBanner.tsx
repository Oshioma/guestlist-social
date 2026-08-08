"use client";

import { useState } from "react";

// A one-time celebratory banner shown on the board right after the guided tour
// finishes (?tour=done). It points the user at where their saved post now lives
// and reinforces the yellow=Saved / green=Ready mental model. Dismissible.
export default function OnboardingFinishBanner({
  dateLabel,
}: {
  dateLabel: string | null;
}) {
  const [open, setOpen] = useState(true);
  if (!open) return null;

  return (
    <div style={wrap} className="ob-finish-banner">
      <div style={{ fontSize: 26, lineHeight: 1 }}>🎉</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: "#18181b" }}>
          Here&apos;s your first post
        </div>
        <div style={{ fontSize: 13.5, color: "#3f3f46", marginTop: 3, lineHeight: 1.45 }}>
          It&apos;s saved{dateLabel ? ` for ${dateLabel}` : ""} on your board below. Tap it to
          reopen or edit. <strong style={{ color: "#854d0e" }}>🟡 Yellow = Saved</strong>{" "}
          · <strong style={{ color: "#166534" }}>🟢 Green = Ready to go</strong>. Press green
          whenever you&apos;re ready — nothing posts on its own.
        </div>
      </div>
      <button type="button" onClick={() => setOpen(false)} style={dismiss} aria-label="Dismiss">
        ✕
      </button>
    </div>
  );
}

const wrap: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 14,
  background: "linear-gradient(180deg,#faf5ff,#ffffff)",
  border: "1px solid #ddd6fe",
  borderRadius: 14,
  padding: "14px 16px",
  marginBottom: 16,
  boxShadow: "0 10px 30px -22px rgba(109,40,217,.4)",
};

const dismiss: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "#a1a1aa",
  cursor: "pointer",
  fontSize: 14,
  fontWeight: 700,
  padding: 4,
  lineHeight: 1,
};
