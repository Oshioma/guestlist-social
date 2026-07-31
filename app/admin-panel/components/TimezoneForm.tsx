"use client";

import { useMemo, useState, useTransition } from "react";
import {
  REGION_OPTIONS,
  DEFAULT_TIMEZONE,
  formatDateTimeInZone,
} from "@/lib/timezone";

type Props = {
  initial: string;
  onSave: (timeZone: string) => Promise<void>;
};

export default function TimezoneForm({ initial, onSave }: Props) {
  const [timeZone, setTimeZone] = useState(initial);
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = timeZone !== initial;

  // Live preview of a fixed reference instant so the operator can see
  // exactly how times will read in the chosen region before saving. A
  // fixed instant (not "now") keeps the preview stable and easy to reason
  // about: 18:00 UTC is the pipeline's default publish time.
  const preview = useMemo(
    () => formatDateTimeInZone("2026-07-31T18:00:00Z", timeZone),
    [timeZone]
  );

  function handleSave() {
    setSaved(false);
    setError(null);
    startTransition(async () => {
      try {
        await onSave(timeZone);
        setSaved(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not save.");
      }
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <p style={{ fontSize: 13, color: "#52525b", margin: 0, lineHeight: 1.5 }}>
        Choose the region used to display publish times across the app —
        the publish queue and scheduled/published posts. Times are always{" "}
        <em>stored</em> in GMT; this only changes how they&rsquo;re shown, so
        you can read them in your own time. Set it to Tanzania to see times in
        East Africa Time (EAT).
      </p>

      <div>
        <label
          htmlFor="display-timezone"
          style={{ display: "block", fontSize: 12, color: "#71717a", marginBottom: 6 }}
        >
          Region / timezone
        </label>
        <select
          id="display-timezone"
          value={timeZone}
          onChange={(e) => setTimeZone(e.target.value)}
          style={{
            padding: "8px 12px",
            borderRadius: 8,
            border: "1px solid #e4e4e7",
            fontSize: 14,
            background: "#fff",
            minWidth: 280,
          }}
        >
          {/* If the stored value isn't in the curated list, still show it so
              the current selection is never silently lost. */}
          {!REGION_OPTIONS.some((o) => o.value === timeZone) && (
            <option value={timeZone}>{timeZone}</option>
          )}
          {REGION_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div
        style={{
          padding: "10px 14px",
          borderRadius: 10,
          border: "1px solid #e4e4e7",
          background: "#fafafa",
          fontSize: 13,
          color: "#3f3f46",
        }}
      >
        A post published at 18:00 GMT will show as{" "}
        <strong style={{ color: "#18181b" }}>{preview}</strong>
        {timeZone === DEFAULT_TIMEZONE && (
          <span style={{ color: "#a1a1aa" }}> (default)</span>
        )}
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
          {isPending ? "Saving..." : "Save"}
        </button>
        {saved && <span style={{ fontSize: 12, color: "#166534" }}>Saved</span>}
        {error && <span style={{ fontSize: 12, color: "#991b1b" }}>{error}</span>}
      </div>
    </div>
  );
}
