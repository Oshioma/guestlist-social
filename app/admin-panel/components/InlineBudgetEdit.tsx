"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Props = {
  campaignId: number;
  currentBudget: number;
  hasMetaAdsetId: boolean;
};

export default function InlineBudgetEdit({
  campaignId,
  currentBudget,
  hasMetaAdsetId,
}: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(currentBudget));
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  function handleSave() {
    const newBudget = Number(value);
    if (!Number.isFinite(newBudget) || newBudget <= 0) {
      setMessage({ text: "Enter a valid budget", ok: false });
      return;
    }
    setMessage(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/ad-actions-direct", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "update_budget",
            campaignId,
            newBudgetPounds: newBudget,
          }),
        });
        const data = await res.json();
        if (!data.ok) {
          setMessage({ text: data.error, ok: false });
        } else {
          setMessage({ text: "Budget updated", ok: true });
          setEditing(false);
          router.refresh();
        }
      } catch {
        setMessage({ text: "Network error", ok: false });
      }
    });
  }

  if (!hasMetaAdsetId) return null;

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        style={{
          padding: "3px 8px",
          borderRadius: 6,
          border: "1px solid #e4e4e7",
          background: "#fff",
          color: "#71717a",
          fontSize: 11,
          fontWeight: 500,
          cursor: "pointer",
        }}
      >
        Edit budget
      </button>
    );
  }

  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
      <span style={{ fontSize: 12, color: "#71717a" }}>£</span>
      <input
        type="number"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        min="1"
        step="1"
        style={{
          width: 80,
          padding: "4px 8px",
          borderRadius: 6,
          border: "1px solid #e4e4e7",
          fontSize: 13,
        }}
      />
      <span style={{ fontSize: 11, color: "#a1a1aa" }}>/day</span>
      <button
        type="button"
        onClick={handleSave}
        disabled={isPending}
        style={{
          padding: "4px 10px",
          borderRadius: 6,
          border: "none",
          background: "#18181b",
          color: "#fff",
          fontSize: 11,
          fontWeight: 600,
          cursor: isPending ? "wait" : "pointer",
        }}
      >
        {isPending ? "..." : "Save"}
      </button>
      <button
        type="button"
        onClick={() => { setEditing(false); setMessage(null); }}
        style={{
          padding: "4px 10px",
          borderRadius: 6,
          border: "1px solid #e4e4e7",
          background: "#fff",
          color: "#71717a",
          fontSize: 11,
          cursor: "pointer",
        }}
      >
        Cancel
      </button>
      {message && (
        <span style={{ fontSize: 11, color: message.ok ? "#166534" : "#991b1b" }}>
          {message.text}
        </span>
      )}
    </div>
  );
}
