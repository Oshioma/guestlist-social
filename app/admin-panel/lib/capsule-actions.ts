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
  getCapsuleMilestones,
  getCapsuleOpportunities,
  isCapsuleConfigured,
  type CapsuleMilestone,
  type CapsuleOpportunitySummary,
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

// Where a Capsule opportunity has landed: won, lost, or still in play.
// Won = Capsule's Won stage (probability 100, or a "won" milestone name);
// lost = a lostReason on the opportunity, or a "lost" milestone name.
// Anything ambiguous counts as still-in-play, so a pending row is never
// flipped on a guess.
function capsuleOutcome(
  opp: CapsuleOpportunitySummary,
  milestones: Map<number, CapsuleMilestone>
): "won" | "lost" | "open" {
  const stage =
    opp.milestoneId != null ? milestones.get(opp.milestoneId) : undefined;
  const stageName = (opp.milestoneName || stage?.name || "").trim().toLowerCase();
  if (opp.lost || stageName === "lost") return "lost";
  if (stage?.probability === 100 || stageName === "won") return "won";
  return "open";
}

// Keep the pipeline in step with Capsule, in one read-only-on-Capsule pass:
//
//   1. LINK — match unlinked rows to existing Capsule opportunities by
//      contact name (case-insensitive; the newest opportunity wins when a
//      contact has several) and save the ids.
//   2. STATUS — for linked rows still marked pending, follow Capsule's
//      outcome: won → booked, lost → not booked. Rows someone already set
//      by hand (booked / not booked) are never touched, and Capsule is
//      never written to — creation stays behind the per-row button.
//
// Safe to run on page load: any failure (no token, Capsule down) leaves the
// pipeline exactly as it was.
export async function syncCapsuleOpportunities(): Promise<{
  linked: number;
  updated: number;
}> {
  const none = { linked: 0, updated: 0 };
  const access = await getMemberAccess();
  if (!access || !isCapsuleConfigured()) return none;

  const supabase = await createClient();
  const { data: rowData } = await supabase
    .from("sales_opportunities")
    .select("id, company, status, capsule_opportunity_id")
    .or("capsule_opportunity_id.is.null,status.eq.pending");
  const rows = (rowData ?? []) as {
    id: number;
    company: string | null;
    status: string;
    capsule_opportunity_id: number | null;
  }[];
  if (rows.length === 0) return none;

  const capsule = await getCapsuleOpportunities();
  if (!capsule.ok) return none;
  const milestones = await getCapsuleMilestones();

  const byId = new Map(capsule.opportunities.map((o) => [o.id, o]));
  // Newest opportunity per contact name, for the linking pass.
  const byPartyName = new Map<string, CapsuleOpportunitySummary>();
  for (const opp of capsule.opportunities) {
    const key = opp.partyName.trim().toLowerCase();
    if (!key) continue;
    const existing = byPartyName.get(key);
    if (!existing || opp.id > existing.id) byPartyName.set(key, opp);
  }

  let linked = 0;
  let updated = 0;
  for (const row of rows) {
    // 1. Link.
    let capsuleOpp =
      row.capsule_opportunity_id != null
        ? byId.get(row.capsule_opportunity_id)
        : undefined;
    if (row.capsule_opportunity_id == null) {
      const match = byPartyName.get((row.company ?? "").trim().toLowerCase());
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
      if (error) continue;
      linked += 1;
      capsuleOpp = match;
    }

    // 2. Status — pending rows follow Capsule's outcome.
    if (row.status !== "pending" || !capsuleOpp) continue;
    const outcome = capsuleOutcome(capsuleOpp, milestones);
    if (outcome === "open") continue;
    const { error } = await supabase
      .from("sales_opportunities")
      .update({
        status: outcome === "won" ? "booked" : "not_booked",
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id)
      .eq("status", "pending");
    if (!error) updated += 1;
  }
  return { linked, updated };
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
