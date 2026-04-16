"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Props = {
  adId: number;
  adName: string;
  currentStatus: string;
  hasMetaId: boolean;
  hasAdsetMetaId: boolean;
  hasCreative: boolean;
};

export default function AdQuickActions({
  adId,
  adName,
  currentStatus,
  hasMetaId,
  hasAdsetMetaId,
  hasCreative,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [showDuplicate, setShowDuplicate] = useState(false);
  const [dupName, setDupName] = useState(`${adName} — copy`);

  async function callApi(body: Record<string, unknown>) {
    setMessage(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/ad-actions-direct", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!data.ok) {
          setMessage({ text: data.error, ok: false });
        } else {
          setMessage({ text: "Done", ok: true });
          router.refresh();
        }
      } catch {
        setMessage({ text: "Network error", ok: false });
      }
    });
  }

  const isPaused = currentStatus === "paused" || currentStatus === "PAUSED";
  const canToggle = hasMetaId;
  const canDuplicate = hasAdsetMetaId && hasCreative;

  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
      {canToggle && (
        <button
          type="button"
          onClick={() =>
            callApi({
              action: "toggle_ad_status",
              adId,
              newStatus: isPaused ? "ACTIVE" : "PAUSED",
            })
          }
          disabled={isPending}
          style={{
            padding: "5px 10px",
            borderRadius: 6,
            border: "none",
            background: isPaused ? "#166534" : "#991b1b",
            color: "#fff",
            fontSize: 11,
            fontWeight: 600,
            cursor: isPending ? "wait" : "pointer",
          }}
        >
          {isPending ? "..." : isPaused ? "Activate" : "Pause"}
        </button>
      )}

      {canDuplicate && (
        <>
          <button
            type="button"
            onClick={() => setShowDuplicate(!showDuplicate)}
            disabled={isPending}
            style={{
              padding: "5px 10px",
              borderRadius: 6,
              border: "1px solid #e4e4e7",
              background: "#fff",
              color: "#18181b",
              fontSize: 11,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Duplicate
          </button>

          {showDuplicate && (
            <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
              <input
                value={dupName}
                onChange={(e) => setDupName(e.target.value)}
                style={{
                  padding: "4px 8px",
                  borderRadius: 6,
                  border: "1px solid #e4e4e7",
                  fontSize: 11,
                  width: 200,
                }}
              />
              <button
                type="button"
                onClick={() => {
                  callApi({ action: "duplicate_ad", adId, newName: dupName });
                  setShowDuplicate(false);
                }}
                disabled={isPending || !dupName.trim()}
                style={{
                  padding: "4px 10px",
                  borderRadius: 6,
                  border: "none",
                  background: "#18181b",
                  color: "#fff",
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Go
              </button>
            </div>
          )}
        </>
      )}

      {message && (
        <span style={{ fontSize: 11, color: message.ok ? "#166534" : "#991b1b" }}>
          {message.text}
        </span>
      )}
    </div>
  );
}
