"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setPublicSignupAction } from "./system-actions";

// A live on/off switch for public self-serve sign-up. Flips the app_settings
// value immediately — no deploy needed.
export default function PublicSignupToggle({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [on, setOn] = useState(enabled);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggle() {
    const next = !on;
    setError(null);
    start(async () => {
      const res = await setPublicSignupAction(next);
      if (res.ok) {
        setOn(next);
        router.refresh();
      } else {
        setError(res.error ?? "Couldn't save.");
      }
    });
  }

  return (
    <div style={card}>
      <div style={{ flex: "1 1 260px", minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#27272a" }}>
          Public sign-up
        </div>
        <p style={{ fontSize: 12.5, color: "#71717a", margin: "3px 0 0", lineHeight: 1.5 }}>
          {on
            ? "OPEN — anyone can create an account at /sign-up."
            : "Closed — the app is invite-only. Only people you invite can join."}
        </p>
        {error && (
          <p style={{ fontSize: 12.5, color: "#b91c1c", margin: "6px 0 0" }}>{error}</p>
        )}
      </div>

      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label="Toggle public sign-up"
        onClick={toggle}
        disabled={pending}
        style={{
          ...switchTrack,
          background: on ? "#22c55e" : "#d4d4d8",
          cursor: pending ? "default" : "pointer",
          opacity: pending ? 0.7 : 1,
        }}
      >
        <span style={{ ...switchKnob, transform: on ? "translateX(22px)" : "translateX(2px)" }} />
      </button>
    </div>
  );
}

const card: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 16,
  padding: "14px 16px",
  border: "1px solid #e4e4e7",
  borderRadius: 12,
  background: "#fff",
  flexWrap: "wrap",
};

const switchTrack: React.CSSProperties = {
  position: "relative",
  width: 46,
  height: 26,
  borderRadius: 999,
  border: "none",
  flex: "0 0 auto",
  transition: "background 150ms ease",
  padding: 0,
};

const switchKnob: React.CSSProperties = {
  position: "absolute",
  top: 2,
  left: 0,
  width: 22,
  height: 22,
  borderRadius: 999,
  background: "#fff",
  boxShadow: "0 1px 2px rgba(0,0,0,.2)",
  transition: "transform 150ms ease",
};
