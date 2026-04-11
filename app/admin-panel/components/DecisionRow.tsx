"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type DecisionData = {
  id: number;
  ad_id: number;
  ad_name: string;
  type: string;
  reason: string;
  action: string;
  confidence: string;
  meta_action: string | null;
  status: string;
  execution_result: string | null;
};

const typeLabels: Record<string, string> = {
  scale_budget: "Scale Budget",
  pause_or_replace: "Pause / Replace",
  kill_test: "Kill Test",
  apply_known_fix: "Apply Known Fix",
  apply_winning_pattern: "Apply Pattern",
};

const typeColors: Record<string, { bg: string; text: string }> = {
  scale_budget: { bg: "#dcfce7", text: "#166534" },
  pause_or_replace: { bg: "#fee2e2", text: "#991b1b" },
  kill_test: { bg: "#fef3c7", text: "#92400e" },
  apply_known_fix: { bg: "#dbeafe", text: "#1e40af" },
  apply_winning_pattern: { bg: "#f3e8ff", text: "#6b21a8" },
};

const confColors: Record<string, { bg: string; text: string }> = {
  high: { bg: "#dcfce7", text: "#166534" },
  medium: { bg: "#fef3c7", text: "#92400e" },
  low: { bg: "#f4f4f5", text: "#71717a" },
};

const statusColors: Record<string, { bg: string; text: string }> = {
  approved: { bg: "#dcfce7", text: "#166534" },
  rejected: { bg: "#f4f4f5", text: "#71717a" },
  executed: { bg: "#dbeafe", text: "#1e40af" },
};

export default function DecisionRow({ decision }: { decision: DecisionData }) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const tc = typeColors[decision.type] ?? typeColors.apply_known_fix;
  const cc = confColors[decision.confidence] ?? confColors.low;

  async function handleAction(action: string) {
    setLoading(action);
    setMessage(null);
    try {
      const res = await fetch("/api/decision-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decisionId: decision.id, action }),
      });
      const data = await res.json();
      if (!data.ok) {
        setMessage(`Error: ${data.error}`);
      } else {
        if (action === "execute" && data.result) {
          setMessage(data.result);
        } else {
          setMessage(action === "approve" ? "Approved — action created" : action === "reject" ? "Rejected" : "Done");
        }
        router.refresh();
      }
    } catch {
      setMessage("Network error");
    } finally {
      setLoading(null);
    }
  }

  const isDone = decision.status !== "pending";

  return (
    <div
      style={{
        border: "1px solid #e4e4e7",
        borderRadius: 12,
        padding: 14,
        background: isDone ? "#fafafa" : "#fff",
        opacity: isDone ? 0.75 : 1,
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: "#18181b" }}>
          {decision.ad_name}
        </span>
        <span
          style={{
            padding: "2px 10px",
            borderRadius: 999,
            fontSize: 11,
            fontWeight: 600,
            background: tc.bg,
            color: tc.text,
          }}
        >
          {typeLabels[decision.type] ?? decision.type}
        </span>
        <span
          style={{
            padding: "2px 8px",
            borderRadius: 999,
            fontSize: 11,
            fontWeight: 600,
            background: cc.bg,
            color: cc.text,
            textTransform: "uppercase",
          }}
        >
          {decision.confidence}
        </span>
        {isDone && (
          <span
            style={{
              padding: "2px 8px",
              borderRadius: 999,
              fontSize: 11,
              fontWeight: 600,
              background: statusColors[decision.status]?.bg ?? "#f4f4f5",
              color: statusColors[decision.status]?.text ?? "#71717a",
              textTransform: "uppercase",
            }}
          >
            {decision.status}
          </span>
        )}
      </div>

      {/* Reason + Action */}
      <div style={{ marginTop: 6, fontSize: 12, color: "#52525b" }}>
        {decision.reason}
      </div>
      <div style={{ marginTop: 4, fontSize: 13, fontWeight: 500, color: "#18181b" }}>
        {decision.action}
      </div>

      {/* Execution result */}
      {decision.execution_result && (
        <div style={{ marginTop: 4, fontSize: 11, color: "#71717a", fontStyle: "italic" }}>
          {decision.execution_result}
        </div>
      )}

      {/* Buttons */}
      {decision.status === "pending" && (
        <div style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "center" }}>
          <button
            onClick={() => handleAction("approve")}
            disabled={loading !== null}
            style={{
              padding: "5px 14px",
              borderRadius: 6,
              border: "none",
              background: "#166534",
              color: "#fff",
              fontSize: 12,
              fontWeight: 600,
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading === "approve" ? "..." : "Approve"}
          </button>
          <button
            onClick={() => handleAction("reject")}
            disabled={loading !== null}
            style={{
              padding: "5px 14px",
              borderRadius: 6,
              border: "1px solid #e4e4e7",
              background: "#fff",
              color: "#71717a",
              fontSize: 12,
              fontWeight: 600,
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading === "reject" ? "..." : "Reject"}
          </button>
          {decision.meta_action && (
            <button
              onClick={() => handleAction("execute")}
              disabled={loading !== null}
              style={{
                padding: "5px 14px",
                borderRadius: 6,
                border: "none",
                background: "#18181b",
                color: "#fff",
                fontSize: 12,
                fontWeight: 600,
                cursor: loading ? "not-allowed" : "pointer",
              }}
            >
              {loading === "execute" ? "..." : "Execute Now"}
            </button>
          )}
          {message && (
            <span
              style={{
                fontSize: 11,
                color: message.startsWith("Error") ? "#991b1b" : "#166534",
              }}
            >
              {message}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
