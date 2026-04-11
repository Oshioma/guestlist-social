"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Variant = {
  id: number;
  ad_id: number;
  label: string;
  role: string;
  notes: string | null;
  ad_name: string;
  snapshot_before: Record<string, unknown> | null;
  snapshot_after: Record<string, unknown> | null;
};

type Experiment = {
  id: number;
  title: string;
  hypothesis: string | null;
  variable_tested: string | null;
  success_metric: string | null;
  secondary_metric: string | null;
  status: string;
  outcome: string | null;
  winner: string | null;
  confidence: string | null;
  started_at: string | null;
  completed_at: string | null;
  variants: Variant[];
};

const statusColors: Record<string, { bg: string; text: string }> = {
  planned: { bg: "#f4f4f5", text: "#71717a" },
  running: { bg: "#dbeafe", text: "#1e40af" },
  completed: { bg: "#dcfce7", text: "#166534" },
};

const confidenceColors: Record<string, { bg: string; text: string }> = {
  high: { bg: "#dcfce7", text: "#166534" },
  medium: { bg: "#fef3c7", text: "#92400e" },
  low: { bg: "#fee2e2", text: "#991b1b" },
};

function MetricCell({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 10, color: "#71717a" }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 600 }}>{value}</div>
    </div>
  );
}

function VariantRow({ v, metric }: { v: Variant; metric: string }) {
  const before = v.snapshot_before as Record<string, number> | null;
  const after = v.snapshot_after as Record<string, number> | null;

  const bVal = before ? Number(before[metric] ?? 0) : null;
  const aVal = after ? Number(after[metric] ?? 0) : null;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "8px 10px",
        background: v.role === "control" ? "#fafafa" : "#f0fdf4",
        borderRadius: 8,
        border: "1px solid #f4f4f5",
      }}
    >
      <span
        style={{
          padding: "1px 8px",
          borderRadius: 999,
          fontSize: 11,
          fontWeight: 600,
          background: v.role === "control" ? "#f4f4f5" : "#dbeafe",
          color: v.role === "control" ? "#71717a" : "#1e40af",
          textTransform: "uppercase",
        }}
      >
        {v.role}
      </span>
      <span style={{ fontSize: 13, fontWeight: 500, flex: 1 }}>
        {v.ad_name}
        {v.notes && (
          <span style={{ fontSize: 11, color: "#a1a1aa", marginLeft: 6 }}>
            ({v.notes})
          </span>
        )}
      </span>

      {before && (
        <MetricCell
          label={`Before ${metric}`}
          value={bVal != null ? String(bVal) : "—"}
        />
      )}
      {after && (
        <MetricCell
          label={`After ${metric}`}
          value={aVal != null ? String(aVal) : "—"}
        />
      )}
      {before && after && bVal != null && aVal != null && (
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            color:
              metric === "cpc" || metric === "cost_per_result"
                ? aVal < bVal
                  ? "#166534"
                  : aVal > bVal
                  ? "#991b1b"
                  : "#71717a"
                : aVal > bVal
                ? "#166534"
                : aVal < bVal
                ? "#991b1b"
                : "#71717a",
          }}
        >
          {aVal > bVal ? "+" : ""}
          {(aVal - bVal).toFixed(2)}
        </span>
      )}
    </div>
  );
}

export default function ExperimentCard({ experiment }: { experiment: Experiment }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const sc = statusColors[experiment.status] ?? statusColors.planned;
  const metric = experiment.success_metric || "ctr";

  async function handleAction(action: string) {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/experiments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, experimentId: experiment.id }),
      });
      const data = await res.json();
      if (!data.ok) {
        setMessage(`Error: ${data.error}`);
      } else {
        if (action === "start") setMessage("Started — before snapshots captured");
        if (action === "complete")
          setMessage(
            `Completed — winner: ${data.winner || "none"}, confidence: ${data.confidence}`
          );
        router.refresh();
      }
    } catch {
      setMessage("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        border: "1px solid #e4e4e7",
        borderRadius: 14,
        padding: 16,
        background: "#fff",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 15, fontWeight: 600, color: "#18181b" }}>
          {experiment.title}
        </span>
        <span
          style={{
            padding: "2px 10px",
            borderRadius: 999,
            fontSize: 11,
            fontWeight: 600,
            background: sc.bg,
            color: sc.text,
            textTransform: "uppercase",
          }}
        >
          {experiment.status}
        </span>
        {experiment.winner && (
          <span
            style={{
              padding: "2px 10px",
              borderRadius: 999,
              fontSize: 11,
              fontWeight: 600,
              background: "#dcfce7",
              color: "#166534",
            }}
          >
            Winner: {experiment.winner}
          </span>
        )}
        {experiment.confidence && experiment.status === "completed" && (
          <span
            style={{
              padding: "2px 10px",
              borderRadius: 999,
              fontSize: 11,
              fontWeight: 600,
              background: confidenceColors[experiment.confidence]?.bg ?? "#f4f4f5",
              color: confidenceColors[experiment.confidence]?.text ?? "#71717a",
            }}
          >
            {experiment.confidence} confidence
          </span>
        )}
      </div>

      {/* Details */}
      <div style={{ marginTop: 8, fontSize: 12, color: "#52525b", display: "flex", flexDirection: "column", gap: 2 }}>
        {experiment.hypothesis && <div>Hypothesis: {experiment.hypothesis}</div>}
        {experiment.variable_tested && <div>Variable: {experiment.variable_tested}</div>}
        <div>Success metric: {metric}{experiment.secondary_metric ? ` (secondary: ${experiment.secondary_metric})` : ""}</div>
      </div>

      {/* Variants */}
      {experiment.variants.length > 0 && (
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
          {experiment.variants.map((v) => (
            <VariantRow key={v.id} v={v} metric={metric} />
          ))}
        </div>
      )}

      {/* Action buttons */}
      <div style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "center" }}>
        {experiment.status === "planned" && (
          <button
            onClick={() => handleAction("start")}
            disabled={loading}
            style={{
              padding: "5px 16px",
              borderRadius: 6,
              border: "1px solid #e4e4e7",
              background: "#18181b",
              color: "#fff",
              fontSize: 12,
              fontWeight: 600,
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Starting..." : "Start Experiment"}
          </button>
        )}
        {experiment.status === "running" && (
          <button
            onClick={() => handleAction("complete")}
            disabled={loading}
            style={{
              padding: "5px 16px",
              borderRadius: 6,
              border: "1px solid #e4e4e7",
              background: "#166534",
              color: "#fff",
              fontSize: 12,
              fontWeight: 600,
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Completing..." : "Complete Experiment"}
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
    </div>
  );
}
