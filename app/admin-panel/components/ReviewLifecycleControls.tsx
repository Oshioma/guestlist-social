"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Props = {
  reviewId: number;
  status: string;
  shareToken: string | null;
  onSend: (reviewId: number) => Promise<{ token: string }>;
  onMarkApproved: (reviewId: number) => Promise<void>;
};

export default function ReviewLifecycleControls({
  reviewId,
  status,
  shareToken,
  onSend,
  onMarkApproved,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [token, setToken] = useState<string | null>(shareToken);
  const [localStatus, setLocalStatus] = useState(status);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function handleSend() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await onSend(reviewId);
        setToken(res.token);
        setLocalStatus("sent");
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed");
      }
    });
  }

  function handleApprove() {
    setError(null);
    startTransition(async () => {
      try {
        await onMarkApproved(reviewId);
        setLocalStatus("approved");
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed");
      }
    });
  }

  async function copyShareLink() {
    if (!token) return;
    const url = `${window.location.origin}/r/${token}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      window.prompt("Copy this link", url);
    }
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        flexWrap: "wrap",
      }}
    >
      {localStatus === "draft" && (
        <button
          type="button"
          onClick={handleSend}
          disabled={pending}
          style={{
            padding: "8px 14px",
            borderRadius: 10,
            background: pending ? "#f4f4f5" : "#18181b",
            color: pending ? "#71717a" : "#fff",
            border: "1px solid #18181b",
            fontSize: 13,
            fontWeight: 600,
            cursor: pending ? "default" : "pointer",
          }}
        >
          {pending ? "Sending…" : "Send for client review"}
        </button>
      )}

      {(localStatus === "sent" || localStatus === "approved") && token && (
        <button
          type="button"
          onClick={copyShareLink}
          style={{
            padding: "8px 14px",
            borderRadius: 10,
            background: "#fff",
            color: "#18181b",
            border: "1px solid #e4e4e7",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          {copied ? "Link copied" : "Copy share link"}
        </button>
      )}

      {localStatus === "sent" && (
        <button
          type="button"
          onClick={handleApprove}
          disabled={pending}
          style={{
            padding: "8px 14px",
            borderRadius: 10,
            background: pending ? "#f4f4f5" : "#166534",
            color: pending ? "#71717a" : "#fff",
            border: "1px solid #166534",
            fontSize: 13,
            fontWeight: 600,
            cursor: pending ? "default" : "pointer",
          }}
        >
          Mark whole review approved
        </button>
      )}

      {error && (
        <span style={{ fontSize: 12, color: "#991b1b" }}>{error}</span>
      )}
    </div>
  );
}
