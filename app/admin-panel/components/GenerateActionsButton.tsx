"use client";

import { useTransition } from "react";

type Props = {
  action: () => Promise<void>;
};

export default function GenerateActionsButton({ action }: Props) {
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      await action();
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "8px 12px",
        borderRadius: 10,
        border: "1px solid #e4e4e7",
        background: isPending ? "#f4f4f5" : "#fff",
        color: "#18181b",
        fontSize: 13,
        fontWeight: 600,
        cursor: isPending ? "wait" : "pointer",
        opacity: isPending ? 0.7 : 1,
      }}
    >
      {isPending ? "Generating..." : "Generate actions"}
    </button>
  );
}
