"use server";

// ---------------------------------------------------------------------------
// Capsule CRM — server actions for the Sales tabs.
//
// Small writes back into the CRM: ticking a task off from the calendar, and
// pushing a pipeline opportunity into Capsule (creating/matching the contact
// and storing the resulting ids on the row so it stays linked). Gated on
// admitted staff, same as the rest of the sales surface.
// ---------------------------------------------------------------------------

import { revalidatePath } from "next/cache";
import { createClient } from "../../../lib/supabase/server";
import { getMemberAccess } from "@/lib/auth/permissions";
import {
  completeCapsuleTask,
  createCapsuleOpportunity,
} from "@/lib/capsule";

async function requireStaff(): Promise<void> {
  const access = await getMemberAccess();
  if (!access) throw new Error("Not authorized");
}

// Tick a Capsule task off from the calendar tab.
export async function completeCapsuleTaskAction(
  taskId: number
): Promise<{ error: string | null }> {
  await requireStaff();
  if (!Number.isFinite(taskId)) return { error: "Bad task id" };

  const result = await completeCapsuleTask(Math.trunc(taskId));
  if (!result.ok) return { error: result.error };

  revalidatePath("/app/sales/calls");
  return { error: null };
}

export type SendToCapsuleResult = {
  error: string | null;
  capsulePartyId: number | null;
  capsuleOpportunityId: number | null;
};

// Push one pipeline row into Capsule: match or create the contact, create
// the opportunity on the first pipeline stage, and store the ids on the row.
// A row that's already linked is a no-op returning its existing ids.
export async function sendOpportunityToCapsule(
  oppId: number
): Promise<SendToCapsuleResult> {
  await requireStaff();

  const supabase = await createClient();
  const { data: row, error: readErr } = await supabase
    .from("sales_opportunities")
    .select(
      "id, company, amount, notes, follow_up, capsule_party_id, capsule_opportunity_id"
    )
    .eq("id", oppId)
    .maybeSingle<{
      id: number;
      company: string | null;
      amount: unknown;
      notes: string | null;
      follow_up: string | null;
      capsule_party_id: number | null;
      capsule_opportunity_id: number | null;
    }>();
  if (readErr || !row) {
    return {
      error: "Opportunity not found.",
      capsulePartyId: null,
      capsuleOpportunityId: null,
    };
  }
  if (row.capsule_opportunity_id != null) {
    return {
      error: null,
      capsulePartyId: row.capsule_party_id,
      capsuleOpportunityId: row.capsule_opportunity_id,
    };
  }

  const amount = row.amount == null ? null : Number(row.amount);
  const result = await createCapsuleOpportunity({
    company: row.company ?? "",
    amount: amount != null && Number.isFinite(amount) ? amount : null,
    notes: row.notes ?? "",
    expectedCloseOn: row.follow_up,
  });
  if (!result.ok) {
    return {
      error: result.error,
      capsulePartyId: null,
      capsuleOpportunityId: null,
    };
  }

  const { error: writeErr } = await supabase
    .from("sales_opportunities")
    .update({
      capsule_party_id: result.partyId,
      capsule_opportunity_id: result.opportunityId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id);
  if (writeErr) {
    // The Capsule records exist — surface the ids anyway so the UI can link.
    console.warn("[capsule] created in Capsule but link save failed:", writeErr.message);
  }

  revalidatePath("/app/sales/opportunities");
  return {
    error: null,
    capsulePartyId: result.partyId,
    capsuleOpportunityId: result.opportunityId,
  };
}
