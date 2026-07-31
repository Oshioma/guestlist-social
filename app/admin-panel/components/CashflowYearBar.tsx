"use client";

// ---------------------------------------------------------------------------
// CashflowYearBar — switch between forecast years and duplicate the current
// year into a new one (e.g. roll 2026 forward to 2027, or seed 2025 as a copy).
// ---------------------------------------------------------------------------

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { duplicateCashflowYear } from "../lib/cashflow-actions";

export default function CashflowYearBar({
  years,
  currentYear,
}: {
  years: number[];
  currentYear: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState(String(currentYear + 1));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function duplicate() {
    const t = Number(target);
    if (!Number.isInteger(t) || t < 2000 || t > 2100) {
      setError("Enter a valid year.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await duplicateCashflowYear(currentYear, t);
      if (res?.error) {
        setError(res.error);
        return;
      }
      setOpen(false);
      router.push(`/app/cashflow?year=${t}`);
      router.refresh();
    });
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        flexWrap: "wrap",
      }}
    >
      <div style={{ display: "inline-flex", gap: 6 }}>
        {years.map((y) => {
          const active = y === currentYear;
          return (
            <button
              key={y}
              type="button"
              onClick={() => {
                if (!active) router.push(`/app/cashflow?year=${y}`);
              }}
              style={{
                padding: "6px 14px",
                borderRadius: 999,
                border: "1px solid #e4e4e7",
                background: active ? "#18181b" : "#fff",
                color: active ? "#fff" : "#52525b",
                fontSize: 13,
                fontWeight: 600,
                cursor: active ? "default" : "pointer",
              }}
            >
              {y}
            </button>
          );
        })}
      </div>

      <div style={{ position: "relative" }}>
        <button
          type="button"
          onClick={() => {
            setError(null);
            setTarget(String(currentYear + 1));
            setOpen((v) => !v);
          }}
          style={{
            padding: "6px 12px",
            borderRadius: 999,
            border: "1px dashed #c4c4cc",
            background: "#fff",
            color: "#52525b",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          + Duplicate year
        </button>

        {open && (
          <div
            style={{
              position: "absolute",
              top: "calc(100% + 6px)",
              left: 0,
              zIndex: 10,
              background: "#fff",
              border: "1px solid #e4e4e7",
              borderRadius: 12,
              padding: 14,
              boxShadow: "0 8px 24px rgba(0,0,0,0.10)",
              width: 260,
            }}
          >
            <div style={{ fontSize: 13, color: "#3f3f46", marginBottom: 8 }}>
              Copy all of <strong>{currentYear}</strong> into:
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type="number"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                style={{
                  width: 90,
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: "1px solid #d4d4d8",
                  fontSize: 14,
                }}
              />
              <button
                type="button"
                onClick={duplicate}
                disabled={pending}
                style={{
                  padding: "8px 14px",
                  borderRadius: 8,
                  border: "none",
                  background: "#18181b",
                  color: "#fff",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: pending ? "wait" : "pointer",
                  opacity: pending ? 0.7 : 1,
                }}
              >
                {pending ? "Copying…" : "Duplicate"}
              </button>
            </div>
            <div style={{ fontSize: 11, color: "#a1a1aa", marginTop: 8 }}>
              Copies every line and the opening balance. Won&apos;t overwrite a
              year that already has data.
            </div>
            {error && (
              <div style={{ fontSize: 12, color: "#b91c1c", marginTop: 8 }}>
                {error}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
