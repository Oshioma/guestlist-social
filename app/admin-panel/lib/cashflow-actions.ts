"use server";

// ---------------------------------------------------------------------------
// Cashflow forecast — server data layer.
//
// Reads and mutations for the editable monthly forecast grid. Every write is
// a small, targeted change (one cell, one label, one row) so the client can
// stay optimistic and only round-trips the single thing that changed. Totals
// are never written — the page derives them, so the numbers can't drift.
//
// All access goes through the cookie-scoped server client, so Supabase RLS
// (admins only — see the migration) is the real guard even though the page is
// already role-gated.
// ---------------------------------------------------------------------------

import { revalidatePath } from "next/cache";
import { createClient } from "../../../lib/supabase/server";
import { requireAdmin } from "@/lib/auth/permissions";
import {
  type CashflowData,
  type CashflowKind,
  type CashflowLine,
  normalizeAmounts,
} from "./cashflow-shared";

const CASHFLOW_PATH = "/app/cashflow";

export async function getCashflow(year: number): Promise<CashflowData> {
  const supabase = await createClient();

  const [{ data: lineRows }, { data: settingRow }] = await Promise.all([
    supabase
      .from("cashflow_lines")
      .select("id, year, section, label, kind, sort_order, amounts")
      .eq("year", year)
      .order("sort_order", { ascending: true }),
    supabase
      .from("cashflow_settings")
      .select("opening_balance")
      .eq("year", year)
      .maybeSingle<{ opening_balance: number }>(),
  ]);

  const lines: CashflowLine[] = (lineRows ?? []).map((r) => ({
    id: r.id as number,
    year: r.year as number,
    section: r.section as string,
    label: r.label as string,
    kind: (r.kind as CashflowKind) ?? "cost",
    sortOrder: r.sort_order as number,
    amounts: normalizeAmounts(r.amounts),
  }));

  return {
    year,
    openingBalance: Number(settingRow?.opening_balance ?? 0),
    lines,
  };
}

// ── Mutations ──────────────────────────────────────────────────────────────

// Set a single month's value on a row. `monthIndex` is 0 (Jan) … 11 (Dec).
export async function updateCashflowCell(
  id: number,
  monthIndex: number,
  value: number
): Promise<void> {
  await requireAdmin();
  if (monthIndex < 0 || monthIndex > 11) throw new Error("Bad month");
  const amount = Number.isFinite(value) ? value : 0;

  const supabase = await createClient();
  const { data: row, error: readErr } = await supabase
    .from("cashflow_lines")
    .select("amounts")
    .eq("id", id)
    .single<{ amounts: unknown }>();
  if (readErr) throw new Error(readErr.message);

  const amounts = normalizeAmounts(row?.amounts);
  amounts[monthIndex] = amount;

  const { error } = await supabase
    .from("cashflow_lines")
    .update({ amounts, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath(CASHFLOW_PATH);
}

// Copy the value in `fromMonth` across every later month in the row — the
// "type rent once, fill right" affordance.
export async function fillRight(id: number, fromMonth: number): Promise<void> {
  await requireAdmin();
  if (fromMonth < 0 || fromMonth > 11) throw new Error("Bad month");

  const supabase = await createClient();
  const { data: row, error: readErr } = await supabase
    .from("cashflow_lines")
    .select("amounts")
    .eq("id", id)
    .single<{ amounts: unknown }>();
  if (readErr) throw new Error(readErr.message);

  const amounts = normalizeAmounts(row?.amounts);
  for (let i = fromMonth + 1; i < 12; i++) amounts[i] = amounts[fromMonth];

  const { error } = await supabase
    .from("cashflow_lines")
    .update({ amounts, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath(CASHFLOW_PATH);
}

export async function renameCashflowLine(
  id: number,
  label: string
): Promise<void> {
  await requireAdmin();
  const trimmed = label.trim();
  if (!trimmed) throw new Error("Label can't be empty");

  const supabase = await createClient();
  const { error } = await supabase
    .from("cashflow_lines")
    .update({ label: trimmed, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath(CASHFLOW_PATH);
}

// Add a blank row to the bottom of a section. Returns the new row so the
// client can drop it straight into place without a full refetch.
export async function addCashflowLine(
  year: number,
  section: string,
  kind: CashflowKind
): Promise<CashflowLine> {
  await requireAdmin();

  const supabase = await createClient();
  const { data: last } = await supabase
    .from("cashflow_lines")
    .select("sort_order")
    .eq("year", year)
    .eq("section", section)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle<{ sort_order: number }>();

  const sortOrder = (last?.sort_order ?? 0) + 1;

  const { data, error } = await supabase
    .from("cashflow_lines")
    .insert({
      year,
      section,
      label: "New item",
      kind,
      sort_order: sortOrder,
      amounts: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    })
    .select("id, year, section, label, kind, sort_order, amounts")
    .single();
  if (error) throw new Error(error.message);

  revalidatePath(CASHFLOW_PATH);
  return {
    id: data.id as number,
    year: data.year as number,
    section: data.section as string,
    label: data.label as string,
    kind: (data.kind as CashflowKind) ?? kind,
    sortOrder: data.sort_order as number,
    amounts: normalizeAmounts(data.amounts),
  };
}

export async function deleteCashflowLine(id: number): Promise<void> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("cashflow_lines").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(CASHFLOW_PATH);
}

export async function setOpeningBalance(
  year: number,
  value: number
): Promise<void> {
  await requireAdmin();
  const balance = Number.isFinite(value) ? value : 0;

  const supabase = await createClient();
  const { error } = await supabase.from("cashflow_settings").upsert(
    { year, opening_balance: balance, updated_at: new Date().toISOString() },
    { onConflict: "year" }
  );
  if (error) throw new Error(error.message);

  revalidatePath(CASHFLOW_PATH);
}
