"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Props = {
  reviewId: number;
  onRewrite: (
    reviewId: number
  ) => Promise<{ ok: boolean; error?: string; confidence?: string }>;
};

// ---------------------------------------------------------------------------
// "Rewrite with Claude" button. Lives next to the lifecycle controls on a
// draft review. Calls the rewrite server action which updates the narrative
// blocks in place; we just refresh once it lands.
// ---------------------------------------------------------------------------
export default function RewriteWithAIButton({ reviewId, onRewrite }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confidence, setConfidence] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    setConfidence(null);
    startTransition(async () => {
      try {
        const res = await onRewrite(reviewId);
        if (!res.ok) {
          setError(res.error ?? "Rewrite failed");
          return;
        }
        if (res.confidence) setConfidence(res.confidence);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Rewrite failed");
      }
    });
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        style={{
          padding: "8px 14px",
          borderRadius: 10,
          background: pending ? "#f4f4f5" : "#fff",
          color: pending ? "#71717a" : "#18181b",
          border: "1px solid #e4e4e7",
          fontSize: 13,
          fontWeight: 600,
          cursor: pending ? "default" : "pointer",
        }}
      >
        {pending ? "Rewriting…" : "Rewrite with Claude"}
      </button>
      {confidence && !error && (
        <span
          style={{
            fontSize: 12,
            color: "#52525b",
            textTransform: "capitalize",
          }}
        >
          Confidence: {confidence}
        </span>
      )}
      {error && (
        <span style={{ fontSize: 12, color: "#991b1b" }}>{error}</span>
      )}
    </div>
  );
}
