"use client";

import { useTransition, useState } from "react";

export default function MetaSyncButton({
  action,
  label,
  pendingLabel,
}: {
  action: () => Promise<{ ok: boolean; log?: string[]; error?: string }>;
  label?: string;
  pendingLabel?: string;
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
        {isPending ? (pendingLabel ?? "Syncing from Meta...") : (label ?? "Sync from Meta")}
      </button>

      {result && (() => {
        const hasPartialFailure =
          result.ok && result.log?.some((line) => line.includes("✗ Failed"));
        const borderColor = !result.ok
          ? "#fecaca"
          : hasPartialFailure
          ? "#fde68a"
          : "#bbf7d0";
        const bgColor = !result.ok
          ? "#fef2f2"
          : hasPartialFailure
          ? "#fffbeb"
          : "#f0fdf4";
        const headerColor = !result.ok
          ? "#991b1b"
          : hasPartialFailure
          ? "#92400e"
          : "#166534";
        const headerText = !result.ok
          ? "Sync failed"
          : hasPartialFailure
          ? "Sync finished with errors"
          : "Sync complete";

        return (
          <div
            style={{
              padding: 14,
              borderRadius: 12,
              border: `1px solid ${borderColor}`,
              background: bgColor,
              fontSize: 13,
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ fontWeight: 600, color: headerColor }}>
                {headerText}
              </div>
              {result.error && (
                <div style={{ color: "#991b1b", fontWeight: 500 }}>
                  {result.error}
                </div>
              )}
              {result.log?.map((line, i) => {
                const isFailure = line.startsWith("✗");
                const isSuccess = line.startsWith("✓");
                const isSeparator = line === "---";
                if (isSeparator) {
                  return (
                    <div key={i} style={{ height: 1, background: "#e4e4e7", margin: "4px 0" }} />
                  );
                }
                return (
                  <div
                    key={i}
                    style={{
                      color: isFailure ? "#991b1b" : isSuccess ? "#166534" : "#52525b",
                      fontWeight: isFailure || isSuccess ? 500 : 400,
                    }}
                  >
                    {line}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
