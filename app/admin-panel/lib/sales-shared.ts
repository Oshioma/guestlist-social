// Shared, side-effect-free sales-tracker types + constants.
//
// Kept separate from sales-actions.ts because that file is "use server"
// (every export there must be an async server action). These plain values are
// imported by both the server actions and the client grids.

export const WEEK_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"] as const;

export const SALES_METRICS = ["calls", "opps", "deals"] as const;
export type SalesMetric = (typeof SALES_METRICS)[number];

export const METRIC_LABELS: Record<SalesMetric, string> = {
  calls: "Calls",
  opps: "Opps",
  deals: "Deals",
};

// One rep's activity for one week. Day arrays are always length 5, Mon … Fri.
export type SalesWeek = {
  id: number;
  weekStart: string; // ISO date of the Monday, e.g. "2026-04-20"
  rep: string;
  calls: number[];
  opps: number[];
  deals: number[];
  leads: number;
};

export type OppStatus = "pending" | "booked" | "not_booked";

export const OPP_STATUS_LABELS: Record<OppStatus, string> = {
  pending: "Pending",
  booked: "Booked",
  not_booked: "Not booked",
};

export type SalesOpportunity = {
  id: number;
  monthStart: string; // ISO date of the 1st of the month, e.g. "2026-03-01"
  oppDate: string | null; // day the pitch was logged
  company: string;
  amount: number | null; // quoted amount in GBP
  status: OppStatus;
  followUp: string | null; // call-back / decision date
  notes: string;
  sortOrder: number;
};

// Coerce whatever came back from jsonb into a clean 5-number array.
export function normalizeDays(raw: unknown): number[] {
  const arr = Array.isArray(raw) ? raw : [];
  return Array.from({ length: 5 }, (_, i) => {
    const n = Number(arr[i]);
    return Number.isFinite(n) ? n : 0;
  });
}

export function normalizeStatus(raw: unknown): OppStatus {
  return raw === "booked" || raw === "not_booked" ? raw : "pending";
}
