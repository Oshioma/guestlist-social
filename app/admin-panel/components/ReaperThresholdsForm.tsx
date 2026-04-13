"use client";

// Operator-tunable reaper thresholds. The percent ↔ float conversion is
// handled by the server action — this component only ever sees percent
// integers, which is what the operator is typing.

import { useState, useTransition } from "react";
import {
  saveReaperSettings,
  resetReaperSettings,
  type SaveReaperResult,
} from "../lib/app-settings-action";

type Bounds = {
  minDecisiveVerdicts: { min: number; max: number };
  negRatioPercent: { min: number; max: number };
};

export default function ReaperThresholdsForm({
  initialMinDecisive,
  initialNegRatioPercent,
  bounds,
  isDefault,
}: {
  initialMinDecisive: number;
  initialNegRatioPercent: number;
  bounds: Bounds;
  isDefault: boolean;
}) {
  const [minDecisive, setMinDecisive] = useState(String(initialMinDecisive));
  const [negPct, setNegPct] = useState(String(initialNegRatioPercent));
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<
    | { kind: "idle" }
    | { kind: "saved"; at: number }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  function handleResult(result: SaveReaperResult) {
    if (result.ok) {
      setMinDecisive(String(result.saved.minDecisiveVerdicts));
      setNegPct(String(result.saved.negRatioPercent));
      setStatus({ kind: "saved", at: Date.now() });
    } else {
      setStatus({ kind: "error", message: result.error });
    }
  }

  function onSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await saveReaperSettings(formData);
      handleResult(result);
    });
  }

  function onReset() {
    startTransition(async () => {
      const result = await resetReaperSettings();
      handleResult(result);
    });
  }

  return (
    <form
      action={onSubmit}
      style={{ display: "flex", flexDirection: "column", gap: 18 }}
    >
      <p style={{ fontSize: 14, color: "#52525b", margin: 0 }}>
        The engine learns from every decision it makes. When a particular move
        keeps failing, we retire it so the engine stops suggesting it. These
        two knobs decide when "keeps failing" tips over into "retire it".
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <label
          htmlFor="minDecisiveVerdicts"
          style={{ fontSize: 13, fontWeight: 600, color: "#27272a" }}
        >
          Minimum tries before a move can be retired
        </label>
        <input
          id="minDecisiveVerdicts"
          name="minDecisiveVerdicts"
          type="number"
          step={1}
          min={bounds.minDecisiveVerdicts.min}
          max={bounds.minDecisiveVerdicts.max}
          value={minDecisive}
          onChange={(e) => setMinDecisive(e.target.value)}
          disabled={pending}
          style={{
            width: 120,
            padding: "8px 10px",
            borderRadius: 8,
            border: "1px solid #d4d4d8",
            fontSize: 14,
            background: "#fff",
          }}
        />
        <p style={{ fontSize: 12, color: "#71717a", margin: "2px 0 0" }}>
          We won't pull the plug on a move until we've tested it at least this
          many times. Lower means we cut losses fast; higher means we give
          moves more chances to prove themselves.{" "}
          <span style={{ color: "#a1a1aa" }}>
            (Allowed: {bounds.minDecisiveVerdicts.min}–
            {bounds.minDecisiveVerdicts.max} tries)
          </span>
        </p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <label
          htmlFor="negRatioPercent"
          style={{ fontSize: 13, fontWeight: 600, color: "#27272a" }}
        >
          Failure rate that triggers retirement
        </label>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            id="negRatioPercent"
            name="negRatioPercent"
            type="number"
            step={1}
            min={bounds.negRatioPercent.min}
            max={bounds.negRatioPercent.max}
            value={negPct}
            onChange={(e) => setNegPct(e.target.value)}
            disabled={pending}
            style={{
              width: 120,
              padding: "8px 10px",
              borderRadius: 8,
              border: "1px solid #d4d4d8",
              fontSize: 14,
              background: "#fff",
            }}
          />
          <span style={{ fontSize: 14, color: "#52525b" }}>%</span>
        </div>
        <p style={{ fontSize: 12, color: "#71717a", margin: "2px 0 0" }}>
          If a move fails this often or more across its tries, we retire it.
          Set lower to be stricter; set higher to give bad-looking moves the
          benefit of the doubt.{" "}
          <span style={{ color: "#a1a1aa" }}>
            (Allowed: {bounds.negRatioPercent.min}%–
            {bounds.negRatioPercent.max}%)
          </span>
        </p>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button
          type="submit"
          disabled={pending}
          style={{
            padding: "8px 16px",
            borderRadius: 8,
            border: "1px solid #18181b",
            background: pending ? "#52525b" : "#18181b",
            color: "#fff",
            fontSize: 13,
            fontWeight: 600,
            cursor: pending ? "wait" : "pointer",
          }}
        >
          {pending ? "Saving…" : "Save thresholds"}
        </button>
        <button
          type="button"
          onClick={onReset}
          disabled={pending || isDefault}
          title={
            isDefault
              ? "Already set to defaults"
              : "Restore the out-of-the-box thresholds"
          }
          style={{
            padding: "8px 12px",
            borderRadius: 8,
            border: "1px solid #d4d4d8",
            background: "#fff",
            color: isDefault ? "#a1a1aa" : "#52525b",
            fontSize: 13,
            fontWeight: 500,
            cursor: pending || isDefault ? "not-allowed" : "pointer",
          }}
        >
          Reset to defaults
        </button>
        {status.kind === "saved" && (
          <span style={{ fontSize: 13, color: "#15803d" }}>
            Saved — the next reaper sweep will use these.
          </span>
        )}
        {status.kind === "error" && (
          <span style={{ fontSize: 13, color: "#b91c1c" }}>
            {status.message}
          </span>
        )}
      </div>
    </form>
  );
}
