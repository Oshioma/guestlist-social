/**
 * Display timezone for publish times.
 *
 * The whole publishing pipeline stores and enters times as UTC/GMT:
 * `publish_time` is an "HH:MM" string in UTC, and `scheduled_for` /
 * `published_at` are UTC timestamps. That's the right storage model — it
 * never drifts. But operators think in their own local time ("this post
 * goes out at 9pm my time"), so the *display* layer converts UTC into a
 * region the agency picks in Settings.
 *
 * This module is pure (no Supabase, no server-only APIs) so it's safe to
 * import from both server pages and client components. The get/set helpers
 * that touch `app_settings` live in `lib/app-settings.ts`.
 */

// Settings key for the agency-wide display timezone in `app_settings`.
export const DISPLAY_TIMEZONE_KEY = "display_timezone";

// Default is UK time. We use "Europe/London" (not fixed "Etc/GMT") so the
// clock tracks British Summer Time automatically — BST (UTC+1) from late
// March to late October, GMT (UTC+0) in winter — which is what "UK time"
// means to the team. Storage stays UTC; this only affects display.
export const DEFAULT_TIMEZONE = "Europe/London";

// Curated "quick pick" regions shown at the top of the picker. IANA
// `value` drives the actual conversion; `label` is the human-facing option
// text. `abbrev` is the clean short label shown next to times (GMT, EAT…).
// We hardcode it only for fixed-offset zones — where it never changes and
// where runtime ICU data is inconsistent (some environments render "GMT+3"
// instead of "EAT"). DST zones leave it empty and fall back to a date-aware
// Intl lookup so "BST" vs "GMT" resolves correctly for the actual instant.
//
// This is no longer the *only* list an operator can choose from — the
// settings picker also offers every IANA zone via getAllTimeZones() — but
// it stays the source of truth for curated abbreviations and the handful of
// regions worth surfacing first.
export const REGION_OPTIONS: { value: string; label: string; abbrev: string }[] = [
  { value: "Europe/London", label: "United Kingdom — auto GMT/BST (default)", abbrev: "" },
  { value: "Etc/GMT", label: "GMT — fixed UTC+0 year-round (no summer time)", abbrev: "GMT" },
  { value: "Africa/Dar_es_Salaam", label: "Tanzania — East Africa Time", abbrev: "EAT" },
  { value: "Africa/Nairobi", label: "Kenya — East Africa Time", abbrev: "EAT" },
  { value: "Africa/Lagos", label: "Nigeria — West Africa Time", abbrev: "WAT" },
  { value: "Africa/Johannesburg", label: "South Africa — SAST", abbrev: "SAST" },
  { value: "Africa/Cairo", label: "Egypt — Eastern European Time", abbrev: "EET" },
  { value: "Asia/Dubai", label: "Gulf — Dubai", abbrev: "GST" },
  { value: "Europe/Paris", label: "Central Europe — Paris", abbrev: "" },
  { value: "America/New_York", label: "US Eastern — New York", abbrev: "" },
  { value: "America/Los_Angeles", label: "US Pacific — Los Angeles", abbrev: "" },
];

// Fixed reference instant for abbreviation lookups when the caller doesn't
// have a specific date (e.g. a settings preview). Mid-year avoids nothing
// in particular — it's just a stable, valid instant.
const ABBREV_REFERENCE = new Date("2026-07-31T12:00:00Z");

// Offset of a timezone from UTC, in minutes, at a given instant. Positive
// means ahead of UTC. Used to derive DST-aware labels (e.g. UK: +60 → BST,
// 0 → GMT) without depending on the runtime's ICU abbreviation data, which
// varies (some environments render "GMT+1" instead of "BST").
function zoneOffsetMinutes(date: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const map: Record<string, string> = {};
  for (const p of dtf.formatToParts(date)) {
    if (p.type !== "literal") map[p.type] = p.value;
  }
  const asUTC = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(map.hour === "24" ? "0" : map.hour),
    Number(map.minute),
    Number(map.second)
  );
  return Math.round((asUTC - date.getTime()) / 60000);
}

// "UTC+03:00" / "UTC-05:30" / "UTC" for a zone at a given instant. Shown
// alongside every option in the full timezone picker so an operator can
// tell zones apart without knowing IANA names by heart. DST-aware, since
// it's derived from the actual offset on `date`.
export function formatUtcOffset(timeZone: string, date?: Date): string {
  const mins = zoneOffsetMinutes(date ?? ABBREV_REFERENCE, normalizeTimeZone(timeZone));
  if (mins === 0) return "UTC";
  const sign = mins > 0 ? "+" : "-";
  const abs = Math.abs(mins);
  const hh = String(Math.floor(abs / 60)).padStart(2, "0");
  const mm = String(abs % 60).padStart(2, "0");
  return `UTC${sign}${hh}:${mm}`;
}

// Every IANA timezone the runtime knows about, sorted. This is the "all
// timezones" list behind the settings picker. `Intl.supportedValuesOf` is
// available in every modern browser and in the Node version we deploy on;
// if it's ever missing we fall back to the curated regions so the picker
// still works rather than throwing.
export function getAllTimeZones(): string[] {
  const supported = (
    Intl as unknown as { supportedValuesOf?: (k: string) => string[] }
  ).supportedValuesOf;
  if (typeof supported === "function") {
    try {
      return supported("timeZone").slice().sort();
    } catch {
      // fall through to the curated fallback
    }
  }
  return REGION_OPTIONS.map((o) => o.value).sort();
}

/**
 * Short zone label for a timezone at a given instant — "GMT", "EAT",
 * "BST"… Prefers our curated abbreviation for fixed-offset zones, and
 * otherwise asks Intl for the abbreviation that applies on `date` so DST
 * zones stay correct. Never returns "GMT+3"-style offsets when we have a
 * cleaner name on hand.
 */
export function zoneAbbrev(timeZone: string, date?: Date): string {
  const tz = normalizeTimeZone(timeZone);
  const known = REGION_OPTIONS.find((o) => o.value === tz);
  if (known && known.abbrev) return known.abbrev;
  // UK: derive BST vs GMT from the actual offset so the label is always
  // clean and correct for the season, independent of runtime ICU data.
  if (tz === "Europe/London") {
    return zoneOffsetMinutes(date ?? ABBREV_REFERENCE, tz) === 0 ? "GMT" : "BST";
  }
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      timeZoneName: "short",
      hour: "numeric",
    }).formatToParts(date ?? ABBREV_REFERENCE);
    const zonePart = parts.find((p) => p.type === "timeZoneName");
    if (zonePart) return zonePart.value;
  } catch {
    // fall through
  }
  return tz;
}

// Guard against a garbage value in `app_settings` (typo, stale row, hand
// edit). We validate against the IANA database via Intl rather than the
// curated list, so a valid zone we don't happen to list still works — the
// only thing we reject is something the runtime can't resolve.
export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== "string" || tz.length === 0) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// Coerce an arbitrary stored value into a usable timezone, falling back to
// the GMT default. Callers never have to think about bad data.
export function normalizeTimeZone(tz: unknown): string {
  return isValidTimeZone(tz) ? tz : DEFAULT_TIMEZONE;
}

/**
 * Human-friendly description of a zone for headers/banners: its short
 * abbreviation for "now" (GMT, EAT, BST…) plus the curated region label
 * when we have one. Falls back gracefully for zones not in the list.
 */
export function describeZone(timeZone: string): { abbrev: string; label: string } {
  const tz = normalizeTimeZone(timeZone);
  const known = REGION_OPTIONS.find((o) => o.value === tz);
  const label = known ? known.label.split(" — ")[0] : tz.replace(/_/g, " ");
  return { abbrev: zoneAbbrev(tz), label };
}

/**
 * Format a UTC timestamp (ISO string or Date) in the given zone, with the
 * short zone label appended so it's never ambiguous which clock you're
 * reading — e.g. "31 Jul 2026, 9:00 PM EAT".
 */
export function formatDateTimeInZone(
  value: string | Date | null,
  timeZone: string
): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return typeof value === "string" ? value : "—";
  const tz = normalizeTimeZone(timeZone);
  const base = date.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: tz,
  });
  return `${base} ${zoneAbbrev(tz, date)}`;
}

/**
 * Turn a UTC "HH:MM" on a given calendar day into a labelled wall-clock
 * time in the target zone — e.g. utc "18:00" on 2026-07-31 in Tanzania →
 * "21:00 EAT". Used to show operators what a post's stored GMT publish
 * time actually means in their region.
 *
 * `dateKey` anchors the conversion to a real instant, so zones with DST
 * resolve to the correct offset for that date. Returns "" for malformed
 * input so callers can conditionally render.
 */
export function formatUtcClockInZone(
  dateKey: string,
  utcHHMM: string,
  timeZone: string
): string {
  const timeMatch = /^(\d{1,2}):(\d{2})$/.exec(utcHHMM ?? "");
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateKey ?? "");
  if (!timeMatch || !dateMatch) return "";
  const [, hh, mm] = timeMatch;
  const [, y, mo, d] = dateMatch;
  const instant = new Date(
    Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(hh), Number(mm))
  );
  if (Number.isNaN(instant.getTime())) return "";
  const tz = normalizeTimeZone(timeZone);
  const base = instant.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: tz,
  });
  return `${base} ${zoneAbbrev(tz, instant)}`;
}

// Clock (HH:MM + zone label, 24h) for an absolute instant — e.g. a queue's
// `scheduled_for` timestamp — rendered in `timeZone`. Unlike
// formatUtcClockInZone this takes a full timestamp rather than a
// date + HH:MM pair. Returns "" for null/invalid input.
export function formatInstantClockInZone(
  value: string | Date | null,
  timeZone: string
): string {
  if (!value) return "";
  const instant = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(instant.getTime())) return "";
  const tz = normalizeTimeZone(timeZone);
  const base = instant.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: tz,
  });
  return `${base} ${zoneAbbrev(tz, instant)}`;
}

// Calendar date (YYYY-MM-DD) that an instant falls on within `timeZone`.
// Used to tell whether a queue's scheduled date differs from the proofer
// day the card sits under. en-CA gives ISO-ordered output.
export function zonedDateKey(value: string | Date | null, timeZone: string): string {
  if (!value) return "";
  const instant = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(instant.getTime())) return "";
  return instant.toLocaleDateString("en-CA", {
    timeZone: normalizeTimeZone(timeZone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}
