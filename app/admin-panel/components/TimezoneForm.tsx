"use client";

import { useMemo, useState, useTransition } from "react";
import {
  REGION_OPTIONS,
  DEFAULT_TIMEZONE,
  formatDateTimeInZone,
  formatUtcOffset,
  getAllTimeZones,
} from "@/lib/timezone";

// Pretty-print an IANA name: "Africa/Dar_es_Salaam" → "Africa / Dar es Salaam".
function prettyZone(value: string): string {
  return value.replace(/_/g, " ").replace(/\//g, " / ");
}

type Props = {
  initial: string;
  onSave: (timeZone: string) => Promise<void>;
};

export default function TimezoneForm({ initial, onSave }: Props) {
  const [timeZone, setTimeZone] = useState(initial);
  const [filter, setFilter] = useState("");
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = timeZone !== initial;

  // Full IANA list, each tagged with its current UTC offset for the label.
  // Built once — the list is static and offsets are only a rough guide (the
  // exact converted time is shown in the preview below).
  const allZones = useMemo(() => {
    const now = new Date();
    return getAllTimeZones().map((value) => ({
      value,
      pretty: prettyZone(value),
      offset: formatUtcOffset(value, now),
    }));
  }, []);

  // Apply the search box to both the curated and full lists. Matches the
  // IANA name, the pretty name, and the curated label, case-insensitively.
  const q = filter.trim().toLowerCase();
  const common = q
    ? REGION_OPTIONS.filter(
        (o) =>
          o.value.toLowerCase().includes(q) || o.label.toLowerCase().includes(q)
      )
    : REGION_OPTIONS;
  const filteredAll = q
    ? allZones.filter(
        (z) =>
          z.value.toLowerCase().includes(q) || z.pretty.toLowerCase().includes(q)
      )
    : allZones;
  const currentInList =
    common.some((o) => o.value === timeZone) ||
    filteredAll.some((z) => z.value === timeZone);

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
        you can read them in your own time. The default is UK time, which
        follows GMT/BST automatically — or pick any timezone in the world
        from the list below.
      </p>

      <div>
        <label
          htmlFor="timezone-filter"
          style={{ display: "block", fontSize: 12, color: "#71717a", marginBottom: 6 }}
        >
          Region / timezone
        </label>
        <input
          id="timezone-filter"
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Search all timezones (e.g. Tanzania, Tokyo, +05:30)…"
          style={{
            padding: "8px 12px",
            borderRadius: 8,
            border: "1px solid #e4e4e7",
            fontSize: 14,
            background: "#fff",
            minWidth: 280,
            width: "100%",
            maxWidth: 360,
            marginBottom: 8,
          }}
        />
        <select
          id="display-timezone"
          value={timeZone}
          onChange={(e) => setTimeZone(e.target.value)}
          size={q ? 8 : undefined}
          style={{
            display: "block",
            padding: "8px 12px",
            borderRadius: 8,
            border: "1px solid #e4e4e7",
            fontSize: 14,
            background: "#fff",
            minWidth: 280,
            width: "100%",
            maxWidth: 360,
          }}
        >
          {/* If the current value matches nothing in the (possibly filtered)
              lists, still show it so the selection is never silently lost. */}
          {!currentInList && (
            <option value={timeZone}>{prettyZone(timeZone)}</option>
          )}
          {common.length > 0 && (
            <optgroup label="Common">
              {common.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </optgroup>
          )}
          {filteredAll.length > 0 && (
            <optgroup label="All timezones">
              {filteredAll.map((z) => (
                <option key={z.value} value={z.value}>
                  {z.pretty} ({z.offset})
                </option>
              ))}
            </optgroup>
          )}
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
