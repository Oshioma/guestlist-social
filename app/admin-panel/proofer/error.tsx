"use client";

import { useEffect } from "react";

export default function ProoferError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Proofer render error:", error);
  }, [error]);

  return (
    <div
      style={{
        padding: 32,
        maxWidth: 600,
        margin: "0 auto",
        textAlign: "center",
      }}
    >
      <h2
        style={{
          fontSize: 20,
          fontWeight: 700,
          color: "#18181b",
          margin: "0 0 8px",
        }}
      >
        Something went wrong
      </h2>
      <p style={{ fontSize: 14, color: "#71717a", margin: "0 0 16px" }}>
        {error.message || "The page failed to load after saving."}
      </p>
      {error.digest && (
        <p style={{ fontSize: 11, color: "#a1a1aa", margin: "0 0 16px" }}>
          Error ID: {error.digest}
        </p>
      )}
      <button
        type="button"
        onClick={reset}
        style={{
          padding: "10px 20px",
          borderRadius: 8,
          background: "#18181b",
          color: "#fff",
          border: "none",
          fontSize: 13,
          fontWeight: 700,
          cursor: "pointer",
        }}
      >
        Try again
      </button>
    </div>
  );
}
