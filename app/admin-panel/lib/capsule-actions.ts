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
  getCapsuleOpportunities,
  isCapsuleConfigured,
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

// Link unlinked pipeline rows to Capsule records that already exist, by
// matching the company name against each Capsule opportunity's contact
// (case-insensitive; the newest opportunity wins when a contact has several).
// Purely a read-and-link pass — it never creates anything in Capsule, so it's
// safe to run on page load. Returns how many rows were linked; any failure
// (Capsule down, token bad) just returns 0 and the page renders as before.
export async function autoLinkCapsuleOpportunities(): Promise<number> {
  const access = await getMemberAccess();
  if (!access || !isCapsuleConfigured()) return 0;

  const supabase = await createClient();
  const { data: unlinkedRows } = await supabase
    .from("sales_opportunities")
    .select("id, company")
    .is("capsule_opportunity_id", null)
    .neq("company", "");
  const unlinked = (unlinkedRows ?? []) as { id: number; company: string }[];
  if (unlinked.length === 0) return 0;

  const capsule = await getCapsuleOpportunities();
  if (!capsule.ok) return 0;

  // Newest opportunity per contact name.
  const byPartyName = new Map<
    string,
    { id: number; partyId: number | null }
  >();
  for (const opp of capsule.opportunities) {
    const key = opp.partyName.trim().toLowerCase();
    if (!key) continue;
    const existing = byPartyName.get(key);
    if (!existing || opp.id > existing.id) {
      byPartyName.set(key, { id: opp.id, partyId: opp.partyId });
    }
  }

  let linked = 0;
  for (const row of unlinked) {
    const match = byPartyName.get(row.company.trim().toLowerCase());
    if (!match) continue;
    const { error } = await supabase
      .from("sales_opportunities")
      .update({
        capsule_opportunity_id: match.id,
        capsule_party_id: match.partyId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id)
      .is("capsule_opportunity_id", null);
    if (!error) linked += 1;
  }
  return linked;
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
