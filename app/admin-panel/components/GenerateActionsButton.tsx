"use client";

import { useTransition } from "react";

export default function GenerateActionsButton({
  action,
}: {
  action: () => Promise<void>;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => startTransition(() => action())}
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "8px 12px",
        borderRadius: 10,
        border: "1px solid #e4e4e7",
        background: "#fff",
        color: "#18181b",
        fontSize: 13,
        fontWeight: 600,
        cursor: isPending ? "wait" : "pointer",
        opacity: isPending ? 0.6 : 1,
      }}
    >
      {isPending ? "Generating..." : "Generate actions"}
    </button>
  );
}
