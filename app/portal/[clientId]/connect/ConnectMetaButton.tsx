"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Client button for the portal Meta connection CTA. The page itself is a
// server component, so this small piece handles the interactive bits:
// opening the OAuth flow in a new window (instead of navigating the whole
// page, which made the button appear to "stick" before the page abruptly
// became the login screen) and showing an "Opening…" state until the popup
// closes.
//
// `provider` picks the look + wording: "facebook" (default) for the
// Facebook-Login flow, "instagram" for the Instagram Business Login flow
// (the no-Facebook path).
export default function ConnectMetaButton({
  connectUrl,
  label,
  provider = "facebook",
}: {
  connectUrl: string;
  label: string;
  provider?: "facebook" | "instagram";
}) {
  const router = useRouter();
  const [opening, setOpening] = useState(false);

  const isInstagram = provider === "instagram";
  const providerName = isInstagram ? "Instagram" : "Facebook";
  const background = isInstagram ? "#c13584" : "#1877F2";
  const windowName = isInstagram ? "instagramConnect" : "metaConnect";

  function handleClick() {
    const popup = window.open(connectUrl, windowName, "width=600,height=760");
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
          background,
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
        {isInstagram ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
          </svg>
        )}
        {opening ? `Opening ${providerName}…` : label}
      </button>
      {opening && (
        <span style={{ fontSize: 13, color: "#a1a1aa" }}>
          Continue in the {providerName} window we just opened.
        </span>
      )}
    </div>
  );
}
