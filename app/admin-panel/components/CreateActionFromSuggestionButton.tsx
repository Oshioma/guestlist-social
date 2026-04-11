"use client";

import { useTransition, useState } from "react";

export default function CreateActionFromSuggestionButton({
  action,
}: {
  action: () => Promise<void>;
}) {
  const [isPending, startTransition] = useTransition();
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <button
        type="button"
        disabled={isPending || done}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            try {
              await action();
              setDone(true);
            } catch (err) {
              console.error(err);
              setError("Could not create action.");
            }
          });
        }}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "7px 11px",
          borderRadius: 9,
          border: "1px solid #e4e4e7",
          background: done ? "#f4f4f5" : "#18181b",
          color: done ? "#71717a" : "#fff",
          fontSize: 12,
          fontWeight: 600,
          cursor: isPending || done ? "default" : "pointer",
        }}
      >
        {done ? "Action created" : isPending ? "Creating..." : "Create action"}
      </button>

      {error ? (
        <div style={{ fontSize: 12, color: "#b91c1c" }}>{error}</div>
      ) : null}
    </div>
  );
}
