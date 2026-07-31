// Shared, side-effect-free cashflow types + constants.
//
// Kept separate from cashflow-actions.ts because that file is "use server"
// (every export there must be an async server action). These plain values are
// imported by both the server actions and the client grid.

export const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

export type CashflowKind = "cost" | "revenue";

export type CashflowLine = {
  id: number;
  year: number;
  section: string;
  label: string;
  kind: CashflowKind;
  sortOrder: number;
  amounts: number[]; // always length 12, Jan … Dec
};

export type CashflowData = {
  year: number;
  openingBalance: number;
  lines: CashflowLine[];
  // Per-month retainer overrides, length 12 [Jan … Dec]. null = "use the live
  // client total for that month"; a number pins that month.
  retainerOverrides: (number | null)[];
};

// Coerce jsonb into a clean length-12 array of number|null (null = no override).
export function normalizeOverrides(raw: unknown): (number | null)[] {
  const arr = Array.isArray(raw) ? raw : [];
  return Array.from({ length: 12 }, (_, i) => {
    const v = arr[i];
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  });
}

// Section render order + display. Anything not listed falls to the end.
export const SECTION_ORDER: string[] = [
  "Overheads",
  "Software & Subscriptions",
  "Crew",
  "Rooms",
  "Revenue",
];

// Coerce whatever came back from jsonb into a clean 12-number array.
export function normalizeAmounts(raw: unknown): number[] {
  const arr = Array.isArray(raw) ? raw : [];
  return Array.from({ length: 12 }, (_, i) => {
    const n = Number(arr[i]);
    return Number.isFinite(n) ? n : 0;
  });
}
