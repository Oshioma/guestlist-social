"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Props = {
  approvalId: number;
  label: string;
  detail: string | null;
  status: "pending" | "approved" | "declined" | "changed";
  decidedBy?: string | null;
  decidedAt?: string | null;
  // Optional gate: when present, the row will not call onDecide and will
  // instead surface a hint, asking the parent to capture a name first.
  // Used by the public share view to enforce sign-off identity.
  requireSigner?: boolean;
  signerName?: string | null;
  onDecide: (
    approvalId: number,
    decision: "approved" | "declined",
    note?: string
  ) => Promise<void>;
};

export default function ReviewApprovalRow({
  approvalId,
  label,
  detail,
  status: initialStatus,
  decidedBy: initialDecidedBy = null,
  decidedAt: initialDecidedAt = null,
  requireSigner = false,
  signerName = null,
  onDecide,
}: Props) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [decidedBy, setDecidedBy] = useState<string | null>(initialDecidedBy);
  const [decidedAt, setDecidedAt] = useState<string | null>(initialDecidedAt);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function decide(decision: "approved" | "declined") {
    if (requireSigner && !(signerName && signerName.trim())) {
      setError("Type your name above to sign off.");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        await onDecide(approvalId, decision);
        setStatus(decision);
        // Optimistic local copy of the audit trail so the operator (or
        // client) sees "Signed by …" without a hard refresh.
        if (signerName && signerName.trim()) {
          setDecidedBy(signerName.trim());
        }
        setDecidedAt(new Date().toISOString());
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed");
      }
    });
  }

  const isApproved = status === "approved";
  const isDeclined = status === "declined";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
        padding: 12,
        border: "1px solid #e4e4e7",
        borderRadius: 10,
        background: isApproved ? "#f0fdf4" : isDeclined ? "#fef2f2" : "#fff",
        opacity: pending ? 0.6 : 1,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: "#18181b",
          }}
        >
          {label}
        </div>
        {detail && (
          <div
            style={{
              fontSize: 13,
              color: "#52525b",
              marginTop: 4,
              lineHeight: 1.5,
            }}
          >
            {detail}
          </div>
        )}
        {(decidedBy || decidedAt) && (isApproved || isDeclined) && (
          <div
            style={{
              fontSize: 12,
              color: "#71717a",
              marginTop: 6,
              fontStyle: "italic",
            }}
          >
            {isApproved ? "Approved" : "Declined"}
            {decidedBy ? ` by ${decidedBy}` : ""}
            {decidedAt
              ? ` · ${new Date(decidedAt).toLocaleString(undefined, {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}`
              : ""}
          </div>
        )}
        {error && (
          <div style={{ fontSize: 12, color: "#991b1b", marginTop: 6 }}>
            {error}
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
        <button
          type="button"
          onClick={() => decide("approved")}
          disabled={pending || isApproved}
          style={{
            padding: "6px 12px",
            borderRadius: 8,
            border: "1px solid #166534",
            background: isApproved ? "#166534" : "#fff",
            color: isApproved ? "#fff" : "#166534",
            fontSize: 12,
            fontWeight: 600,
            cursor: pending || isApproved ? "default" : "pointer",
          }}
        >
          {isApproved ? "Approved" : "Approve"}
        </button>
        <button
          type="button"
          onClick={() => decide("declined")}
          disabled={pending || isDeclined}
          style={{
            padding: "6px 12px",
            borderRadius: 8,
            border: "1px solid #e4e4e7",
            background: isDeclined ? "#52525b" : "#fff",
            color: isDeclined ? "#fff" : "#52525b",
            fontSize: 12,
            fontWeight: 600,
            cursor: pending || isDeclined ? "default" : "pointer",
          }}
        >
          {isDeclined ? "Declined" : "Decline"}
        </button>
      </div>
    </div>
  );
}
