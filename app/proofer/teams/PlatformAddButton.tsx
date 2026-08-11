"use client";

import { useTransition } from "react";
import { startAccountConnect } from "@/lib/auth/team-actions";

// A small "+" next to the Facebook / Instagram column headers. Clicking it
// starts a connect for that platform (connect-first: the Meta picker adds and
// names the account). The server action does a little DB work before it can
// hand back the OAuth URL, so while it runs we swap the "+" for a spinner and
// "Opening…" — otherwise the ~1s gap looks like nothing happened.
export function PlatformAddButton({
  teamId,
  platform,
}: {
  teamId: string;
  platform: "facebook" | "instagram";
}) {
  const [pending, startTransition] = useTransition();
  const platformLabel = platform === "facebook" ? "Facebook" : "Instagram";

  function go() {
    startTransition(async () => {
      const res = await startAccountConnect(teamId, platform);
      if (res?.url) window.location.href = res.url;
      else window.alert(res?.error ?? "Could not start connecting. Please try again.");
    });
  }

  if (pending) {
    return (
      <span style={pendingWrap} aria-live="polite">
        <Spinner />
        <span style={pendingText}>Opening {platformLabel}…</span>
      </span>
    );
  }

  const label = `Connect a ${platformLabel} account`;
  return (
    <button
      type="button"
      onClick={go}
      style={plusBtn}
      title={label}
      aria-label={label}
    >
      +
    </button>
  );
}

function Spinner() {
  // SMIL animation — self-contained, no global CSS/keyframes needed.
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" style={{ flex: "none" }} aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="none" stroke="#e4e4e7" strokeWidth="3" />
      <path d="M12 3 a9 9 0 0 1 9 9" fill="none" stroke="#52525b" strokeWidth="3" strokeLinecap="round">
        <animateTransform
          attributeName="transform"
          type="rotate"
          from="0 12 12"
          to="360 12 12"
          dur="0.7s"
          repeatCount="indefinite"
        />
      </path>
    </svg>
  );
}

const plusBtn: React.CSSProperties = {
  width: 18,
  height: 18,
  borderRadius: 5,
  border: "1px solid #d8d8dd",
  background: "#fff",
  color: "#52525b",
  fontSize: 13,
  lineHeight: 1,
  fontWeight: 700,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 0,
  flex: "none",
};

const pendingWrap: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  flex: "none",
};

const pendingText: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: "#52525b",
  textTransform: "none",
  letterSpacing: 0,
  whiteSpace: "nowrap",
};
