"use client";

import { useEffect, useState } from "react";

const KEY = "gs:last-failure";
const WINDOW_MS = 30 * 60 * 1000;

type Failure = { message: string; source: string; at: number; url: string };

/**
 * Keeps the reason a page died, across the reload that hides it.
 *
 * When a server action rejects, Next re-renders the route from scratch: the
 * form is gone, the console is cleared, and the operator is left looking at an
 * empty page with no way to say what happened. This records the failure before
 * that happens and shows it on the next render, so there is always something
 * to point at.
 */
export default function FailureRecorder() {
  const [failure, setFailure] = useState<Failure | null>(null);

  useEffect(() => {
    const record = (message: string, source: string) => {
      if (!message) return;
      try {
        window.localStorage.setItem(
          KEY,
          JSON.stringify({ message: message.slice(0, 500), source, at: Date.now(), url: window.location.href })
        );
      } catch {
        /* storage blocked */
      }
    };

    const onError = (e: ErrorEvent) => record(e.message, "error");
    const onRejection = (e: PromiseRejectionEvent) => {
      const r = e.reason;
      record(r instanceof Error ? r.message : String(r ?? ""), "unhandled rejection");
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);

    try {
      const raw = window.localStorage.getItem(KEY);
      if (raw) {
        const f = JSON.parse(raw) as Failure;
        if (f && typeof f.at === "number" && Date.now() - f.at < WINDOW_MS) setFailure(f);
        else window.localStorage.removeItem(KEY);
      }
    } catch {
      /* ignore a corrupt record */
    }

    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  if (!failure) return null;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
        margin: "0 0 16px",
        padding: "10px 12px",
        borderRadius: 10,
        background: "#fffbeb",
        border: "1px solid #fde68a",
        color: "#92400e",
        fontSize: 12,
        lineHeight: 1.5,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <strong style={{ fontWeight: 700 }}>Last failure on this device:</strong>{" "}
        {failure.message}
        <span style={{ display: "block", color: "#a16207", marginTop: 2, wordBreak: "break-all" }}>
          {failure.source} · {new Date(failure.at).toLocaleTimeString()} · {failure.url}
        </span>
      </div>
      <button
        type="button"
        onClick={() => {
          try {
            window.localStorage.removeItem(KEY);
          } catch {
            /* ignore */
          }
          setFailure(null);
        }}
        style={{
          border: "1px solid #fde68a",
          background: "#fff",
          color: "#92400e",
          fontSize: 11,
          fontWeight: 600,
          padding: "4px 10px",
          borderRadius: 8,
          cursor: "pointer",
          flexShrink: 0,
        }}
      >
        Dismiss
      </button>
    </div>
  );
}
