"use client";

import { useState, useTransition } from "react";

type Props = {
  initial: {
    enabled: boolean;
    minConfidence: "high" | "medium";
    allowedTypes: string[];
  };
  onSave: (values: Props["initial"]) => Promise<void>;
};

const ALL_TYPES = [
  { key: "pause_or_replace", label: "Pause / Replace" },
  { key: "kill_test", label: "Kill Test" },
  { key: "scale_budget", label: "Scale Budget" },
  { key: "apply_known_fix", label: "Apply Known Fix" },
  { key: "apply_winning_pattern", label: "Apply Pattern" },
];

export default function AutoApproveForm({ initial, onSave }: Props) {
  const [enabled, setEnabled] = useState(initial.enabled);
  const [minConfidence, setMinConfidence] = useState(initial.minConfidence);
  const [allowedTypes, setAllowedTypes] = useState(initial.allowedTypes);
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty =
    enabled !== initial.enabled ||
    minConfidence !== initial.minConfidence ||
    JSON.stringify([...allowedTypes].sort()) !==
      JSON.stringify([...initial.allowedTypes].sort());

  function toggleType(key: string) {
    setAllowedTypes((prev) =>
      prev.includes(key)
        ? prev.filter((t) => t !== key)
        : [...prev, key]
    );
  }

  function handleSave() {
    setSaved(false);
    setError(null);
    startTransition(async () => {
      try {
        await onSave({ enabled, minConfidence, allowedTypes });
        setSaved(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not save.");
      }
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <p style={{ fontSize: 13, color: "#52525b", margin: 0, lineHeight: 1.5 }}>
        When enabled, decisions that meet the confidence threshold and are of an
        allowed type will be auto-approved when the engine generates them. They
        still need explicit execution — auto-approve gives the green light but
        doesn&rsquo;t push to Meta automatically. All auto-approved decisions are
        tagged <code style={{ fontSize: 12, background: "#f4f4f5", padding: "1px 4px", borderRadius: 4 }}>auto:engine</code> in
        the audit trail.
      </p>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "12px 14px",
          borderRadius: 10,
          border: `1px solid ${enabled ? "#bbf7d0" : "#e4e4e7"}`,
          background: enabled ? "#ecfdf5" : "#fff",
        }}
      >
        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            style={{ width: 16, height: 16 }}
          />
          <span style={{ fontSize: 14, fontWeight: 600, color: "#18181b" }}>
            Enable auto-approve
          </span>
        </label>
      </div>

      {enabled && (
        <>
          <div>
            <label style={{ display: "block", fontSize: 12, color: "#71717a", marginBottom: 6 }}>
              Minimum confidence to auto-approve
            </label>
            <select
              value={minConfidence}
              onChange={(e) =>
                setMinConfidence(e.target.value as "high" | "medium")
              }
              style={{
                padding: "8px 12px",
                borderRadius: 8,
                border: "1px solid #e4e4e7",
                fontSize: 14,
                background: "#fff",
              }}
            >
              <option value="high">High only</option>
              <option value="medium">Medium and above</option>
            </select>
          </div>

          <div>
            <label style={{ display: "block", fontSize: 12, color: "#71717a", marginBottom: 6 }}>
              Allowed decision types
            </label>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {ALL_TYPES.map((t) => (
                <label
                  key={t.key}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    cursor: "pointer",
                    fontSize: 13,
                    color: "#18181b",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={allowedTypes.includes(t.key)}
                    onChange={() => toggleType(t.key)}
                    style={{ width: 14, height: 14 }}
                  />
                  {t.label}
                </label>
              ))}
            </div>
          </div>
        </>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button
          type="button"
          onClick={handleSave}
          disabled={isPending || !dirty}
          style={{
            padding: "8px 18px",
            borderRadius: 8,
            border: "none",
            background: dirty && !isPending ? "#18181b" : "#d4d4d8",
            color: dirty && !isPending ? "#fff" : "#a1a1aa",
            fontSize: 13,
            fontWeight: 600,
            cursor: dirty && !isPending ? "pointer" : "not-allowed",
          }}
        >
          {isPending ? "Saving..." : "Save"}
        </button>
        {saved && <span style={{ fontSize: 12, color: "#166534" }}>Saved</span>}
        {error && <span style={{ fontSize: 12, color: "#991b1b" }}>{error}</span>}
      </div>
    </div>
  );
}
