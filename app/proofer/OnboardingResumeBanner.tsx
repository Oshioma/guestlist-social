"use client";

import { useCallback, useState, useTransition } from "react";
import { skipOnboardingAction } from "./onboarding/actions";

// Shown on the board to a poster who started the guided tour and neither
// finished nor skipped it.
//
// This banner is what lets /proofer STOP force-redirecting mid-tour users into
// the tour (see shouldRunOnboarding). That redirect used to be the only way back
// in, which made the browser's Back button a loop: board → redirect → tour →
// back → board → … Now leaving the tour lands on a usable board, and the way
// back in is visible instead of automatic.
export default function OnboardingResumeBanner({
  href,
  step,
  total,
}: {
  href: string;
  step: number;
  total: number;
}) {
  const [open, setOpen] = useState(true);
  const [pending, startTransition] = useTransition();

  // "No thanks" is the same decision as the tour's own "Skip for now": stop
  // offering it. The tour stays available from the "?" menu.
  const dismissForGood = useCallback(() => {
    setOpen(false);
    startTransition(async () => {
      await skipOnboardingAction(step);
    });
  }, [step]);

  if (!open) return null;

  return (
    <div style={cardStyle}>
      <div style={{ fontSize: 24, lineHeight: 1 }}>🧭</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: "#18181b" }}>
          Your tour is half-finished
        </div>
        <div style={{ fontSize: 13.5, color: "#3f3f46", marginTop: 3, lineHeight: 1.45 }}>
          You stopped at step {step} of {total}. Pick up where you left off and
          finish your first post — it only takes a minute.
        </div>
        {/* The top margin lives here, not on the children: on a narrow screen
            the two actions wrap onto separate lines, and a margin on each one
            stacked with the row gap to leave them drifting apart. */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
            marginTop: 10,
          }}
        >
          <a href={href} style={resumeCtaStyle}>
            Pick up where I left off →
          </a>
          <button
            type="button"
            onClick={dismissForGood}
            disabled={pending}
            style={noThanksStyle}
          >
            No thanks
          </button>
        </div>
      </div>
      {/* Hide for now — unlike "No thanks" this decides nothing, so the banner
          returns on the next visit. */}
      <button
        type="button"
        onClick={() => setOpen(false)}
        style={dismissStyle}
        aria-label="Hide"
      >
        ✕
      </button>
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 14,
  background: "linear-gradient(180deg,#faf5ff,#ffffff)",
  border: "1px solid #ddd6fe",
  borderRadius: 14,
  padding: "14px 16px",
  marginBottom: 16,
  boxShadow: "0 1px 2px rgba(24,24,27,.04)",
};

const resumeCtaStyle: React.CSSProperties = {
  display: "inline-block",
  background: "#6d28d9",
  color: "#fff",
  borderRadius: 9,
  padding: "8px 16px",
  fontSize: 13,
  fontWeight: 700,
  textDecoration: "none",
};

const noThanksStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "#71717a",
  fontSize: 13,
  fontWeight: 600,
  textDecoration: "underline",
  cursor: "pointer",
  padding: 0,
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
