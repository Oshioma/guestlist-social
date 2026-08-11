"use client";

import { useEffect } from "react";

// Error boundary for the whole Proofer surface (the board, Teams, the Meta
// page-picker, …). Next.js normally shows a generic "Application error: a
// client-side exception has occurred" and hides the real message. This renders
// the actual error text on the page instead — so a crash can be diagnosed
// without opening the browser console — plus a Try again / Back to board.
export default function ProoferError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Also log it, for anyone who does have the console open / server logs.
    console.error("Proofer error boundary:", error);
  }, [error]);

  return (
    <main style={wrap}>
      <div style={card}>
        <h1 style={h1}>Something went wrong</h1>
        <p style={sub}>
          The page hit an error. Here&rsquo;s what happened — you can screenshot
          this if you need to report it:
        </p>
        <pre style={pre}>{error?.message || "An unexpected error occurred (no message)."}</pre>
        {error?.digest && (
          <p style={digest}>
            Reference: <code>{error.digest}</code>
          </p>
        )}
        <div style={row}>
          <button type="button" onClick={() => reset()} style={primary}>
            Try again
          </button>
          <a href="/teams" style={ghost}>
            Back to Teams
          </a>
        </div>
      </div>
    </main>
  );
}

const wrap: React.CSSProperties = {
  minHeight: "60vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 24,
  background: "#f3f3f5",
  fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
};
const card: React.CSSProperties = {
  maxWidth: 560,
  width: "100%",
  background: "#fff",
  border: "1px solid #e4e4e7",
  borderRadius: 14,
  padding: 24,
};
const h1: React.CSSProperties = { fontSize: 20, fontWeight: 700, color: "#18181b", margin: "0 0 6px" };
const sub: React.CSSProperties = { fontSize: 14, color: "#52525b", margin: "0 0 12px", lineHeight: 1.5 };
const pre: React.CSSProperties = {
  fontSize: 13,
  color: "#b91c1c",
  background: "#fef2f2",
  border: "1px solid #fecaca",
  borderRadius: 8,
  padding: "10px 12px",
  margin: 0,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
};
const digest: React.CSSProperties = { fontSize: 12, color: "#a1a1aa", margin: "10px 0 0" };
const row: React.CSSProperties = { display: "flex", gap: 10, marginTop: 18, flexWrap: "wrap" };
const primary: React.CSSProperties = {
  background: "#18181b",
  color: "#fff",
  border: "none",
  borderRadius: 8,
  padding: "9px 16px",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
};
const ghost: React.CSSProperties = {
  border: "1px solid #d8d8dd",
  color: "#3f3f46",
  borderRadius: 8,
  padding: "9px 16px",
  fontSize: 13,
  fontWeight: 700,
  textDecoration: "none",
  display: "inline-flex",
  alignItems: "center",
};
