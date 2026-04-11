"use client";

import { useTransition } from "react";

export default function DeleteMemoryButton({
  onDelete,
}: {
  onDelete: () => Promise<void>;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => startTransition(() => onDelete())}
      style={{
        padding: "2px 8px",
        borderRadius: 6,
        border: "1px solid #e4e4e7",
        background: "#fff",
        color: isPending ? "#a1a1aa" : "#71717a",
        fontSize: 11,
        cursor: isPending ? "wait" : "pointer",
      }}
    >
      {isPending ? "..." : "Remove"}
    </button>
  );
}
