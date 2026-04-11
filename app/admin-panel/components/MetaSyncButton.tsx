"use client";

import { useTransition, useState } from "react";

export default function MetaSyncButton({
  action,
}: {
  action: () => Promise<{ ok: boolean; log?: string[]; error?: string }>;
}) {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{
    ok: boolean;
    log?: string[];
    error?: string;
  } | null>(null);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <button
        type="button"
        disabled={isPending}
        onClick={() => {
          setResult(null);
          startTransition(async () => {
            try {
              const res = await action();
              setResult(res);
            } catch (err) {
              setResult({
                ok: false,
                error: err instanceof Error ? err.message : "Sync failed",
              });
            }
          });
        }}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "10px 16px",
          borderRadius: 10,
          border: "1px solid #e4e4e7",
          background: isPending ? "#f4f4f5" : "#18181b",
          color: isPending ? "#71717a" : "#fff",
          fontSize: 13,
          fontWeight: 600,
          cursor: isPending ? "wait" : "pointer",
          minWidth: 200,
        }}
      >
        {isPending ? "Syncing from Meta..." : "Sync from Meta"}
      </button>

      {result && (
        <div
          style={{
            padding: 14,
            borderRadius: 12,
            border: `1px solid ${result.ok ? "#bbf7d0" : "#fecaca"}`,
            background: result.ok ? "#f0fdf4" : "#fef2f2",
            fontSize: 13,
          }}
        >
          {result.ok ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ fontWeight: 600, color: "#166534" }}>
                Sync complete
              </div>
              {result.log?.map((line, i) => (
                <div key={i} style={{ color: "#14532d" }}>
                  {line}
                </div>
              ))}
            </div>
          ) : (
            <div style={{ color: "#991b1b", fontWeight: 500 }}>
              {result.error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
