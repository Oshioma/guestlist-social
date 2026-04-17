"use client";

import { useState, useTransition } from "react";

type Props = {
  clientId: string;
  platform: string;
  metaPostId: string | null;
  publishUrl: string | null;
};

const BUDGET_OPTIONS = [
  { label: "£5/day", cents: 500 },
  { label: "£10/day", cents: 1000 },
  { label: "£25/day", cents: 2500 },
  { label: "£50/day", cents: 5000 },
];

const DURATION_OPTIONS = [
  { label: "3 days", days: 3 },
  { label: "5 days", days: 5 },
  { label: "7 days", days: 7 },
  { label: "14 days", days: 14 },
];

export default function BoostPostButton({
  clientId,
  platform,
  metaPostId,
  publishUrl,
}: Props) {
  const [open, setOpen] = useState(false);
  const [budget, setBudget] = useState(1000);
  const [duration, setDuration] = useState(3);
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const hasPostId = !!(metaPostId || publishUrl);

  function handleBoost() {
    setResult(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/boost-post", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clientId,
            platform,
            metaPostId,
            publishUrl,
            budgetCentsPerDay: budget,
            durationDays: duration,
          }),
        });
        const data = await res.json();
        if (data.ok) {
          const total = (budget / 100) * duration;
          setResult({
            ok: true,
            message: `Boosted for £${total} over ${duration} days`,
          });
          setOpen(false);
        } else {
          setResult({ ok: false, message: data.error });
        }
      } catch {
        setResult({ ok: false, message: "Network error" });
      }
    });
  }

  return (
    <div style={{ display: "inline-flex", flexDirection: "column", gap: 6 }}>
      {!open && !result && (
        <button
          type="button"
          onClick={() => hasPostId ? setOpen(true) : null}
          disabled={!hasPostId}
          title={hasPostId ? "Put money behind this post" : "No Meta post ID — publish via the queue first"}
          style={{
            padding: "6px 12px",
            borderRadius: 8,
            border: "none",
            background: hasPostId
              ? "linear-gradient(135deg, #4338ca 0%, #6d28d9 100%)"
              : "#d4d4d8",
            color: hasPostId ? "#fff" : "#a1a1aa",
            fontSize: 12,
            fontWeight: 700,
            cursor: hasPostId ? "pointer" : "not-allowed",
            whiteSpace: "nowrap",
          }}
        >
          Boost
        </button>
      )}

      {result && (
        <div
          style={{
            padding: "6px 10px",
            borderRadius: 8,
            background: result.ok ? "#ecfdf5" : "#fef2f2",
            border: `1px solid ${result.ok ? "#bbf7d0" : "#fecaca"}`,
            fontSize: 12,
            color: result.ok ? "#166534" : "#991b1b",
            display: "flex",
            gap: 8,
            alignItems: "center",
          }}
        >
          <span>{result.message}</span>
          <button
            type="button"
            onClick={() => setResult(null)}
            style={{
              background: "none",
              border: "none",
              color: "#71717a",
              fontSize: 11,
              cursor: "pointer",
              textDecoration: "underline",
            }}
          >
            dismiss
          </button>
        </div>
      )}

      {open && (
        <div
          style={{
            padding: 14,
            border: "1px solid #e4e4e7",
            borderRadius: 12,
            background: "#fff",
            display: "flex",
            flexDirection: "column",
            gap: 12,
            minWidth: 260,
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 600, color: "#18181b" }}>
            Boost this post
          </div>

          <div>
            <div style={{ fontSize: 11, color: "#71717a", marginBottom: 6 }}>
              Daily budget
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {BUDGET_OPTIONS.map((opt) => (
                <button
                  key={opt.cents}
                  type="button"
                  onClick={() => setBudget(opt.cents)}
                  style={{
                    padding: "5px 12px",
                    borderRadius: 999,
                    border: budget === opt.cents ? "none" : "1px solid #e4e4e7",
                    background: budget === opt.cents ? "#18181b" : "#fff",
                    color: budget === opt.cents ? "#fff" : "#52525b",
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 11, color: "#71717a", marginBottom: 6 }}>
              Duration
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {DURATION_OPTIONS.map((opt) => (
                <button
                  key={opt.days}
                  type="button"
                  onClick={() => setDuration(opt.days)}
                  style={{
                    padding: "5px 12px",
                    borderRadius: 999,
                    border: duration === opt.days ? "none" : "1px solid #e4e4e7",
                    background: duration === opt.days ? "#18181b" : "#fff",
                    color: duration === opt.days ? "#fff" : "#52525b",
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              background: "#f8fafc",
              border: "1px solid #f1f5f9",
              fontSize: 12,
              color: "#52525b",
            }}
          >
            Total: <strong style={{ color: "#18181b" }}>£{((budget / 100) * duration).toFixed(0)}</strong> over {duration} days
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={handleBoost}
              disabled={isPending}
              style={{
                padding: "8px 16px",
                borderRadius: 8,
                border: "none",
                background: isPending ? "#d4d4d8" : "linear-gradient(135deg, #4338ca 0%, #6d28d9 100%)",
                color: "#fff",
                fontSize: 13,
                fontWeight: 700,
                cursor: isPending ? "wait" : "pointer",
              }}
            >
              {isPending ? "Boosting..." : "Boost now"}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              style={{
                padding: "8px 12px",
                borderRadius: 8,
                border: "1px solid #e4e4e7",
                background: "#fff",
                color: "#71717a",
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
