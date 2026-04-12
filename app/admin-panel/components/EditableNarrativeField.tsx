"use client";

// ---------------------------------------------------------------------------
// EditableNarrativeField — inline editor for a single narrative string on a
// draft review. The display side renders the children unchanged; the edit
// side swaps in a textarea + Save / Cancel buttons.
//
// Why a wrapper instead of always-on textareas: the cover block uses heavy
// custom typography (white-on-black hero, italic subheads, etc.) and we want
// the read view to look exactly like the published share view. Wrapping the
// existing typography in an "Edit" affordance keeps the page calm — the
// operator only sees a textarea when they're actively editing.
// ---------------------------------------------------------------------------

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Field = "headline" | "subhead" | "what_happened";

type Props = {
  reviewId: number;
  field: Field;
  initialValue: string;
  // The rendered version (the original styled markup). We keep it as a render
  // prop so callers can pass arbitrary JSX — the headline H1 looks different
  // from the subhead paragraph different from the what_happened block.
  children: React.ReactNode;
  // Optional override for the textarea row count (the headline only needs 2,
  // what_happened wants 6).
  rows?: number;
  // Server action — passed in from the page so this component stays a
  // boundary-only client island. Calling it triggers a router.refresh().
  onSave: (
    reviewId: number,
    field: Field,
    value: string
  ) => Promise<void>;
  // Hide the Edit affordance entirely when the review isn't a draft. The
  // page already gates this, but the prop keeps the component honest if it
  // gets re-used.
  editable: boolean;
};

export default function EditableNarrativeField({
  reviewId,
  field,
  initialValue,
  children,
  rows = 3,
  onSave,
  editable,
}: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!editable) {
    return <>{children}</>;
  }

  if (!editing) {
    return (
      <div style={{ position: "relative", display: "block" }}>
        {children}
        <button
          type="button"
          onClick={() => {
            setValue(initialValue);
            setError(null);
            setEditing(true);
          }}
          style={{
            marginTop: 8,
            padding: "4px 10px",
            borderRadius: 6,
            border: "1px solid rgba(255,255,255,0.2)",
            background: "rgba(255,255,255,0.08)",
            color: "#e4e4e7",
            fontSize: 11,
            fontWeight: 600,
            cursor: "pointer",
            textTransform: "uppercase",
            letterSpacing: "0.04em",
          }}
        >
          Edit
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={rows}
        autoFocus
        style={{
          width: "100%",
          padding: "10px 12px",
          borderRadius: 8,
          border: "1px solid #d4d4d8",
          fontSize: field === "headline" ? 24 : field === "subhead" ? 15 : 14,
          fontWeight: field === "headline" ? 700 : 400,
          lineHeight: 1.4,
          fontFamily: "inherit",
          background: "#fff",
          color: "#18181b",
          resize: "vertical",
        }}
      />
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button
          type="button"
          disabled={isPending}
          onClick={() => {
            setError(null);
            startTransition(async () => {
              try {
                await onSave(reviewId, field, value);
                setEditing(false);
                router.refresh();
              } catch (e) {
                setError(e instanceof Error ? e.message : "Save failed");
              }
            });
          }}
          style={{
            padding: "6px 14px",
            borderRadius: 6,
            border: "none",
            background: "#18181b",
            color: "#fff",
            fontSize: 12,
            fontWeight: 600,
            cursor: isPending ? "not-allowed" : "pointer",
            opacity: isPending ? 0.6 : 1,
          }}
        >
          {isPending ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={() => {
            setEditing(false);
            setError(null);
            setValue(initialValue);
          }}
          style={{
            padding: "6px 14px",
            borderRadius: 6,
            border: "1px solid #e4e4e7",
            background: "#fff",
            color: "#52525b",
            fontSize: 12,
            fontWeight: 600,
            cursor: isPending ? "not-allowed" : "pointer",
          }}
        >
          Cancel
        </button>
        {error && (
          <span style={{ fontSize: 12, color: "#991b1b" }}>{error}</span>
        )}
      </div>
    </div>
  );
}
