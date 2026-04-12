"use client";

// ---------------------------------------------------------------------------
// PublicReviewApprovals
//
// Wraps the per-row approval controls with a single "Your name" capture
// at the top of the section. The public share view has no auth, so the
// audit trail is otherwise blind — this gives us a typed name + timestamp
// pair on every approval, so the trail can show "Approved by Jane Doe at
// 14:32" instead of an anonymous flag.
//
// Why client-side: we want the same name to attach to every button click
// in the same browser session without making the user retype it. Persisted
// in localStorage so a refresh doesn't lose it. The actual write still
// happens server-side via approveProposalByShareToken — the typed name
// flows in as the `signerName` argument.
// ---------------------------------------------------------------------------

import { useEffect, useState } from "react";
import ReviewApprovalRow from "../../admin-panel/components/ReviewApprovalRow";

type Approval = {
  id: number;
  proposal_index: number;
  proposal_label: string;
  proposal_detail: string | null;
  proposal_type: string;
  status: "pending" | "approved" | "declined" | "changed";
  decided_by: string | null;
  decided_at: string | null;
};

type NextItem = {
  idx: number;
  label: string;
  detail: string;
  type: "scale" | "fix" | "launch" | "pause" | "budget";
};

type Group = { type: NextItem["type"]; title: string; tone: string };

type Props = {
  token: string;
  groups: Group[];
  next: NextItem[];
  approvals: Approval[];
  // Server action wrapper that captures the share token in the closure.
  // The wrapper takes the typed name and forwards it as `signerName`.
  decide: (
    approvalId: number,
    decision: "approved" | "declined",
    signerName: string
  ) => Promise<void>;
};

const STORAGE_KEY = "guestlist.review-signer-name";

export default function PublicReviewApprovals({
  groups,
  next,
  approvals,
  decide,
}: Props) {
  const [name, setName] = useState("");
  const [hydrated, setHydrated] = useState(false);

  // Restore name from localStorage on mount. Guarded by a hydration flag
  // so we don't get a server/client text mismatch.
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) setName(stored);
    } catch {
      // localStorage may be blocked in private mode — fall through
    }
    setHydrated(true);
  }, []);

  function updateName(value: string) {
    setName(value);
    try {
      if (value.trim()) {
        window.localStorage.setItem(STORAGE_KEY, value.trim());
      } else {
        window.localStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // ignore
    }
  }

  const approvalsByType = new Map<string, Approval[]>();
  for (const a of approvals) {
    const list = approvalsByType.get(a.proposal_type) ?? [];
    list.push(a);
    approvalsByType.set(a.proposal_type, list);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Identity capture. Compact, calm, persistent. */}
      <div
        style={{
          background: "#fafafa",
          border: "1px solid #e4e4e7",
          borderRadius: 10,
          padding: 14,
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        <label
          htmlFor="signer-name"
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: "#52525b",
            textTransform: "uppercase",
            letterSpacing: "0.04em",
          }}
        >
          Your name
        </label>
        <input
          id="signer-name"
          type="text"
          value={hydrated ? name : ""}
          onChange={(e) => updateName(e.target.value)}
          placeholder="So we can attribute these decisions to you"
          autoComplete="name"
          style={{
            width: "100%",
            padding: "8px 10px",
            fontSize: 14,
            borderRadius: 8,
            border: "1px solid #e4e4e7",
            background: "#fff",
            color: "#18181b",
            outline: "none",
          }}
        />
        <div style={{ fontSize: 11, color: "#a1a1aa" }}>
          Recorded with each approval. Saved on this device only.
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {groups.map((group) => {
          const items = next.filter((n) => n.type === group.type);
          if (items.length === 0) return null;
          const groupApprovals = approvalsByType.get(group.type) ?? [];
          return (
            <div key={group.type}>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: group.tone,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  marginBottom: 8,
                }}
              >
                {group.title}
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                }}
              >
                {items.map((item) => {
                  const approval = groupApprovals.find(
                    (a) => a.proposal_index === item.idx
                  );
                  if (!approval) return null;
                  return (
                    <ReviewApprovalRow
                      key={approval.id}
                      approvalId={approval.id}
                      label={item.label}
                      detail={item.detail}
                      status={approval.status}
                      decidedBy={approval.decided_by}
                      decidedAt={approval.decided_at}
                      requireSigner
                      signerName={name}
                      onDecide={async (id, decision) => {
                        await decide(id, decision, name.trim());
                      }}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
