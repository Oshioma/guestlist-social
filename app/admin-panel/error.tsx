"use client";

import { useEffect } from "react";

/**
 * Error boundary for the whole admin panel.
 *
 * Without one, a server component or server action that fails takes the route
 * down and Next re-renders it from scratch — which is what turned a failed
 * "create" into a page that silently came back empty, with nothing on screen
 * to say anything had gone wrong. This at least names the failure and offers
 * a retry that doesn't lose the page.
 */
export default function AdminPanelError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("admin-panel error boundary:", error);
  }, [error]);

  return (
    <div style={{ padding: 40, maxWidth: 640 }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, color: "#18181b", margin: 0 }}>
        Something went wrong
      </h2>
      <p
        style={{
          fontSize: 13,
          color: "#991b1b",
          margin: "12px 0",
          background: "#fef2f2",
          padding: "10px 12px",
          borderRadius: 8,
          border: "1px solid #fecaca",
          lineHeight: 1.5,
        }}
      >
        {error.message || "The page could not be loaded."}
        {error.digest && (
          <span style={{ display: "block", marginTop: 6, color: "#7f1d1d", fontSize: 11 }}>
            Reference: {error.digest}
          </span>
        )}
      </p>
      <p style={{ fontSize: 13, color: "#52525b", lineHeight: 1.6 }}>
        Anything you had typed into a campaign or ad form is saved on this
        device — go back to the form and it will be restored.
      </p>
      <button
        type="button"
        onClick={reset}
        style={{
          marginTop: 8,
          border: "none",
          borderRadius: 10,
          padding: "10px 16px",
          background: "#18181b",
          color: "#fff",
          fontSize: 14,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        Try again
      </button>
    </div>
  );
}
