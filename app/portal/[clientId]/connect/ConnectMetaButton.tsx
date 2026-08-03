"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Client button for the portal Meta connection CTA. The page itself is a
// server component, so this small piece handles the interactive bits:
// opening Facebook's OAuth flow in a new window (instead of navigating the
// whole page, which made the button appear to "stick" before the page
// abruptly became the Facebook login screen) and showing an "Opening
// Facebook…" state until the popup closes.
export default function ConnectMetaButton({
  connectUrl,
  label,
}: {
  connectUrl: string;
  label: string;
}) {
  const router = useRouter();
  const [opening, setOpening] = useState(false);

  function handleClick() {
    const popup = window.open(connectUrl, "metaConnect", "width=600,height=760");
    if (!popup) {
      // Pop-up blocked — fall back to same-tab navigation so the flow still
      // works rather than silently doing nothing.
      window.location.href = connectUrl;
      return;
    }
    setOpening(true);
    popup.focus();
    // When the popup closes (after the callback lands back on this page
    // inside it), refresh so the updated connection status shows here.
    const timer = window.setInterval(() => {
      if (popup.closed) {
        window.clearInterval(timer);
        setOpening(false);
        router.refresh();
      }
    }, 700);
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
      <button
        type="button"
        onClick={handleClick}
        disabled={opening}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 10,
          background: "#1877F2",
          color: "#fff",
          padding: "12px 22px",
          borderRadius: 8,
          border: "none",
          fontSize: 14,
          fontWeight: 600,
          cursor: opening ? "wait" : "pointer",
          opacity: opening ? 0.85 : 1,
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
        </svg>
        {opening ? "Opening Facebook…" : label}
      </button>
      {opening && (
        <span style={{ fontSize: 13, color: "#a1a1aa" }}>
          Continue in the Facebook window we just opened.
        </span>
      )}
    </div>
  );
}
