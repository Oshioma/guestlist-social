"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Action } from "../lib/types";
import { formatDate } from "../lib/utils";
import { supabase } from "../lib/supabase";

export default function ActionList({
  actions: initial,
}: {
  actions: Action[];
}) {
  const router = useRouter();

  const [doneIds, setDoneIds] = useState<Set<string>>(
    () => new Set(initial.filter((a) => a.done).map((a) => a.id))
  );
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  async function toggle(id: string) {
    if (savingIds.has(id)) return;

    setError(null);

    const currentlyDone = doneIds.has(id);
    const nextDone = !currentlyDone;

    // optimistic UI
    setDoneIds((prev) => {
      const next = new Set(prev);
      if (nextDone) next.add(id);
      else next.delete(id);
      return next;
    });

    setSavingIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });

    const { error: updateError } = await supabase
      .from("actions")
      .update({ is_complete: nextDone })
      .eq("id", id);

    setSavingIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });

    if (updateError) {
      // rollback if save failed
      setDoneIds((prev) => {
        const next = new Set(prev);
        if (currentlyDone) next.add(id);
        else next.delete(id);
        return next;
      });

      console.error("Failed to update action:", updateError);
      setError("Could not save action. Please try again.");
      return;
    }

    router.refresh();
  }

  const sorted = useMemo(() => {
    return [...initial].sort((a, b) => {
      const aDone = doneIds.has(a.id) ? 1 : 0;
      const bDone = doneIds.has(b.id) ? 1 : 0;
      return aDone - bDone;
    });
  }, [initial, doneIds]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {error && (
        <div
          style={{
            fontSize: 13,
            color: "#b91c1c",
            background: "#fef2f2",
            border: "1px solid #fecaca",
            borderRadius: 10,
            padding: "10px 12px",
          }}
        >
          {error}
        </div>
      )}

      {sorted.map((a) => {
        const done = doneIds.has(a.id);
        const saving = savingIds.has(a.id);

        return (
          <button
            key={a.id}
            type="button"
            onClick={() => toggle(a.id)}
            disabled={saving}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 0",
              border: "none",
              borderBottom: "1px solid #f4f4f5",
              background: "transparent",
              opacity: done ? 0.45 : 1,
              cursor: saving ? "wait" : "pointer",
              transition: "opacity 0.2s",
              textAlign: "left",
              width: "100%",
            }}
          >
            <span
              style={{
                width: 18,
                height: 18,
                borderRadius: 4,
                border: done ? "2px solid #166534" : "2px solid #d4d4d8",
                background: done ? "#dcfce7" : "transparent",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 11,
                flexShrink: 0,
                transition: "all 0.15s",
              }}
            >
              {done ? "✓" : ""}
            </span>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 14,
                  textDecoration: done ? "line-through" : "none",
                  transition: "text-decoration 0.15s",
                  color: "#18181b",
                }}
              >
                {a.label}
              </div>
              <div style={{ fontSize: 12, color: "#a1a1aa" }}>
                {a.clientName} · {formatDate(a.due)}
                {saving ? " · Saving..." : ""}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
