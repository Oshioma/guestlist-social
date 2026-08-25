"use server";

// ---------------------------------------------------------------------------
// Sales tracker — server data layer for /app/sales.
//
// Reads and mutations for the weekly activity grid (sales_weeks) and the
// opportunity log (sales_opportunities). Every write is a small, targeted
// change (one day cell, one field of one opportunity) so the client can stay
// optimistic and only round-trips the single thing that changed. Totals are
// never written — the pages derive them, so the numbers can't drift.
//
// All access goes through the cookie-scoped server client, so Supabase RLS
// (any admitted staff member — see the migration) is the real guard even
// though the pages are gated too.
// ---------------------------------------------------------------------------

import { revalidatePath } from "next/cache";
import { createClient } from "../../../lib/supabase/server";
import { getMemberAccess } from "@/lib/auth/permissions";
import {
  SALES_METRICS,
  normalizeDays,
  normalizeStatus,
  type OppStatus,
  type SalesMetric,
  type SalesOpportunity,
  type SalesWeek,
} from "./sales-shared";

const SALES_PATHS = ["/app/sales", "/app/sales/opportunities"];

function revalidateSales() {
  for (const path of SALES_PATHS) revalidatePath(path);
}

// Any admitted admin-panel member may log sales — this matches the RLS policy
// (is_admin() = "has a user_roles row"), so reps can keep their own numbers.
async function requireStaff(): Promise<void> {
  const access = await getMemberAccess();
  if (!access) throw new Error("Not authorized");
}

// Strict ISO date guard for values that end up in .eq()/insert payloads.
function assertIsoDate(value: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value))) {
    throw new Error("Bad date");
  }
}

// Snap any date to the Monday of its week — week_start is always a Monday.
function mondayOf(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  const sinceMonday = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - sinceMonday);
  return d.toISOString().slice(0, 10);
}

function mapWeek(r: Record<string, unknown>): SalesWeek {
  return {
    id: r.id as number,
    weekStart: r.week_start as string,
    rep: r.rep as string,
    calls: normalizeDays(r.calls),
    opps: normalizeDays(r.opps),
    deals: normalizeDays(r.deals),
    leads: Number(r.leads) || 0,
  };
}

// ── Weekly activity ────────────────────────────────────────────────────────

export async function getSalesWeeks(): Promise<SalesWeek[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("sales_weeks")
    .select("id, week_start, rep, calls, opps, deals, leads")
    .order("week_start", { ascending: false })
    .order("rep", { ascending: true });
  return (data ?? []).map(mapWeek);
}

// Add a (week, rep) row. Any date within the week is accepted — it's snapped
// to that week's Monday. Returns the new row for optimistic insertion.
export async function addSalesWeek(
  weekStart: string,
  rep: string
): Promise<{ week: SalesWeek | null; error: string | null }> {
  await requireStaff();
  assertIsoDate(weekStart);
  const monday = mondayOf(weekStart);
  const name = rep.trim() || "Nelly";

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sales_weeks")
    .insert({ week_start: monday, rep: name })
    .select("id, week_start, rep, calls, opps, deals, leads")
    .single();
  if (error) {
    const msg = error.code === "23505"
      ? `${name} already has a row for the week of ${monday}.`
      : error.message;
    return { week: null, error: msg };
  }

  revalidateSales();
  return { week: mapWeek(data), error: null };
}

// Set one day's count for one metric. `day` is 0 (Mon) … 4 (Fri). Uses the
// atomic jsonb_set RPC so concurrent edits to different days can't clobber
// each other.
export async function updateSalesDay(
  id: number,
  metric: SalesMetric,
  day: number,
  value: number
): Promise<void> {
  await requireStaff();
  if (!SALES_METRICS.includes(metric)) throw new Error("Bad metric");
  if (day < 0 || day > 4) throw new Error("Bad day");
  const count = Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;

  const supabase = await createClient();
  const { error } = await supabase.rpc("sales_week_set_day", {
    p_id: id,
    p_metric: metric,
    p_day: day,
    p_value: count,
  });
  if (error) throw new Error(error.message);

  revalidateSales();
}

export async function setSalesLeads(id: number, value: number): Promise<void> {
  await requireStaff();
  const leads = Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;

  const supabase = await createClient();
  const { error } = await supabase
    .from("sales_weeks")
    .update({ leads, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);

  revalidateSales();
}

export async function renameSalesRep(id: number, rep: string): Promise<void> {
  await requireStaff();
  const name = rep.trim();
  if (!name) throw new Error("Name can't be empty");

  const supabase = await createClient();
  const { error } = await supabase
    .from("sales_weeks")
    .update({ rep: name, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);

  revalidateSales();
}

export async function deleteSalesWeek(id: number): Promise<void> {
  await requireStaff();
  const supabase = await createClient();
  const { error } = await supabase.from("sales_weeks").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidateSales();
}

// ── Opportunity log ────────────────────────────────────────────────────────

function mapOpp(r: Record<string, unknown>): SalesOpportunity {
  return {
    id: r.id as number,
    monthStart: r.month_start as string,
    oppDate: (r.opp_date as string | null) ?? null,
    company: (r.company as string) ?? "",
    amount: r.amount == null ? null : Number(r.amount),
    status: normalizeStatus(r.status),
    followUp: (r.follow_up as string | null) ?? null,
    notes: (r.notes as string) ?? "",
    sortOrder: Number(r.sort_order) || 0,
    capsulePartyId:
      r.capsule_party_id == null ? null : Number(r.capsule_party_id),
    capsuleOpportunityId:
      r.capsule_opportunity_id == null ? null : Number(r.capsule_opportunity_id),
  };
}

const OPP_COLUMNS =
  "id, month_start, opp_date, company, amount, status, follow_up, notes, sort_order, capsule_party_id, capsule_opportunity_id";

export async function getSalesOpportunities(): Promise<SalesOpportunity[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("sales_opportunities")
    .select(OPP_COLUMNS)
    .order("month_start", { ascending: false })
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });
  return (data ?? []).map(mapOpp);
}

// Add a blank opportunity to the bottom of a month. Any date within the month
// is accepted — it's snapped to the 1st. Returns the new row so the client
// can drop it into place and focus the company field.
export async function addSalesOpportunity(
  monthStart: string
): Promise<SalesOpportunity> {
  await requireStaff();
  assertIsoDate(monthStart);
  const month = monthStart.slice(0, 7) + "-01";

  const supabase = await createClient();
  const { data: last } = await supabase
    .from("sales_opportunities")
    .select("sort_order")
    .eq("month_start", month)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle<{ sort_order: number }>();

  const { data, error } = await supabase
    .from("sales_opportunities")
    .insert({ month_start: month, sort_order: (last?.sort_order ?? 0) + 10 })
    .select(OPP_COLUMNS)
    .single();
  if (error) throw new Error(error.message);

  revalidateSales();
  return mapOpp(data);
}

export type SalesOpportunityPatch = Partial<{
  company: string;
  amount: number | null;
  status: OppStatus;
  oppDate: string | null;
  followUp: string | null;
  notes: string;
}>;

// Update one or more fields of an opportunity. Fields are whitelisted — the
// month grouping and ordering can't be changed through this path.
export async function updateSalesOpportunity(
  id: number,
  patch: SalesOpportunityPatch
): Promise<void> {
  await requireStaff();

  const update: Record<string, unknown> = {};
  if (patch.company !== undefined) update.company = patch.company.trim();
  if (patch.amount !== undefined) {
    update.amount =
      patch.amount != null && Number.isFinite(patch.amount)
        ? patch.amount
        : null;
  }
  if (patch.status !== undefined) {
    if (!["pending", "booked", "not_booked"].includes(patch.status)) {
      throw new Error("Bad status");
    }
    update.status = patch.status;
  }
  if (patch.oppDate !== undefined) {
    if (patch.oppDate != null) assertIsoDate(patch.oppDate);
    update.opp_date = patch.oppDate;
  }
  if (patch.followUp !== undefined) {
    if (patch.followUp != null) assertIsoDate(patch.followUp);
    update.follow_up = patch.followUp;
  }
  if (patch.notes !== undefined) update.notes = patch.notes;
  if (Object.keys(update).length === 0) return;
  update.updated_at = new Date().toISOString();

  const supabase = await createClient();
  const { error } = await supabase
    .from("sales_opportunities")
    .update(update)
    .eq("id", id);
  if (error) throw new Error(error.message);

  revalidateSales();
}

export async function deleteSalesOpportunity(id: number): Promise<void> {
  await requireStaff();
  const supabase = await createClient();
  const { error } = await supabase
    .from("sales_opportunities")
    .delete()
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidateSales();
}
