"use client";

import { useState, useTransition } from "react";

type Props = {
  initial: {
    goodCtr: number;
    badCtr: number;
    goodCpc: number;
    badCpc: number;
    maxCostPerResult: number;
    minSpendToJudge: number;
    minImpressionsToJudge: number;
  };
  bounds: Record<string, { min: number; max: number }>;
  isDefault: boolean;
  onSave: (values: Props["initial"]) => Promise<void>;
};

const FIELDS: {
  key: keyof Props["initial"];
  label: string;
  unit: string;
  step: number;
}[] = [
  { key: "goodCtr", label: "Good CTR", unit: "%", step: 0.1 },
  { key: "badCtr", label: "Bad CTR", unit: "%", step: 0.1 },
  { key: "goodCpc", label: "Good CPC", unit: "£", step: 0.1 },
  { key: "badCpc", label: "Bad CPC", unit: "£", step: 0.1 },
  { key: "maxCostPerResult", label: "Max cost per result", unit: "£", step: 1 },
  { key: "minSpendToJudge", label: "Min spend to judge", unit: "£", step: 1 },
  { key: "minImpressionsToJudge", label: "Min impressions to judge", unit: "", step: 100 },
];

export default function EngineThresholdsForm({
  initial,
  bounds,
  isDefault,
  onSave,
}: Props) {
  const [values, setValues] = useState(initial);
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = FIELDS.some((f) => values[f.key] !== initial[f.key]);

  function handleSave() {
    setSaved(false);
    setError(null);
    startTransition(async () => {
      try {
        await onSave(values);
        setSaved(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not save.");
      }
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <p style={{ fontSize: 13, color: "#52525b", margin: 0, lineHeight: 1.5 }}>
        These thresholds control how the engine scores ads. An ad with CTR
        above &ldquo;Good CTR&rdquo; gets +2 points; below &ldquo;Bad CTR&rdquo;
        gets &minus;2. Score &ge;3 = winner, &le;&minus;2 = losing.
      </p>

      {isDefault && (
        <div
          style={{
            fontSize: 11,
            color: "#71717a",
            padding: "6px 10px",
            background: "#f4f4f5",
            borderRadius: 8,
          }}
        >
          Using defaults — no custom values saved yet.
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
          gap: 12,
        }}
      >
        {FIELDS.map((f) => {
          const b = bounds[f.key] ?? { min: 0, max: 999 };
          return (
            <div key={f.key}>
              <label
                style={{
                  display: "block",
                  fontSize: 12,
                  color: "#71717a",
                  marginBottom: 4,
                }}
              >
                {f.label} {f.unit && <span style={{ color: "#a1a1aa" }}>({f.unit})</span>}
              </label>
              <input
                type="number"
                min={b.min}
                max={b.max}
                step={f.step}
                value={values[f.key]}
                onChange={(e) =>
                  setValues((v) => ({ ...v, [f.key]: Number(e.target.value) }))
                }
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: "1px solid #e4e4e7",
                  fontSize: 14,
                  background: "#fff",
                  boxSizing: "border-box",
                }}
              />
            </div>
          );
        })}
      </div>

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
          {isPending ? "Saving..." : "Save thresholds"}
        </button>
        {saved && (
          <span style={{ fontSize: 12, color: "#166534" }}>Saved</span>
        )}
        {error && (
          <span style={{ fontSize: 12, color: "#991b1b" }}>{error}</span>
        )}
      </div>
    </div>
  );
}
