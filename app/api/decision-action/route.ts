import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { updateAdStatus, updateCampaignBudget } from "@/lib/meta";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { decisionId, action } = await req.json();
    // action: "approve" | "reject" | "execute"

    if (!decisionId || !action) {
      return NextResponse.json(
        { ok: false, error: "decisionId and action required" },
        { status: 400 }
      );
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      return NextResponse.json({ ok: false, error: "Missing env vars" }, { status: 500 });
    }

    const supabase = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Get the decision
    const { data: decision, error: fetchError } = await supabase
      .from("ad_decisions")
      .select("*")
      .eq("id", decisionId)
      .single();

    if (fetchError || !decision) {
      return NextResponse.json({ ok: false, error: "Decision not found" }, { status: 404 });
    }

    // --- APPROVE ---
    if (action === "approve") {
      const { error } = await supabase
        .from("ad_decisions")
        .update({
          status: "approved",
          approved_at: new Date().toISOString(),
        })
        .eq("id", decisionId);

      if (error) {
        return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      }

      // Auto-create an ad_action from this decision
      await supabase.from("ad_actions").insert({
        ad_id: decision.ad_id,
        problem: decision.reason,
        action: decision.action,
        priority: decision.confidence === "high" ? "high" : decision.confidence === "medium" ? "medium" : "low",
        status: "pending",
      });

      return NextResponse.json({ ok: true, status: "approved" });
    }

    // --- REJECT ---
    if (action === "reject") {
      const { error } = await supabase
        .from("ad_decisions")
        .update({ status: "rejected" })
        .eq("id", decisionId);

      if (error) {
        return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      }

      return NextResponse.json({ ok: true, status: "rejected" });
    }

    // --- EXECUTE ---
    if (action === "execute") {
      let executionResult = "Executed locally";
      const metaResults: string[] = [];

      // Look up the ad's meta_id for Meta API calls
      const { data: adRow } = await supabase
        .from("ads")
        .select("meta_id, campaign_id")
        .eq("id", decision.ad_id)
        .single();

      if (decision.type === "pause_or_replace" || decision.type === "kill_test") {
        // Update ad status in DB
        const { error: adError } = await supabase
          .from("ads")
          .update({ status: "paused", meta_status: "PAUSED" })
          .eq("id", decision.ad_id);

        if (adError) {
          metaResults.push(`DB update failed: ${adError.message}`);
        } else {
          metaResults.push("Ad paused in database");
        }

        // Push to Meta if ad has a meta_id
        if (adRow?.meta_id) {
          const metaRes = await updateAdStatus(adRow.meta_id, "PAUSED");
          if (metaRes.success) {
            metaResults.push("Ad paused on Meta");
          } else {
            metaResults.push(`Meta pause failed: ${metaRes.error}`);
          }
        } else {
          metaResults.push("No meta_id — skipped Meta push");
        }

        executionResult = metaResults.join(". ");
      }

      if (decision.type === "scale_budget") {
        // Look up the campaign to get its meta_id and current budget
        let campaignMetaId: string | null = null;
        let currentBudgetCents = 0;

        if (adRow?.campaign_id) {
          const { data: campaignRow } = await supabase
            .from("campaigns")
            .select("meta_id, daily_budget")
            .eq("id", adRow.campaign_id)
            .single();

          campaignMetaId = campaignRow?.meta_id ?? null;
          currentBudgetCents = Number(campaignRow?.daily_budget ?? 0);
        }

        if (campaignMetaId && currentBudgetCents > 0) {
          // Increase budget by 25%
          const newBudgetCents = Math.round(currentBudgetCents * 1.25);
          const metaRes = await updateCampaignBudget(campaignMetaId, newBudgetCents);

          if (metaRes.success) {
            // Update local DB too
            await supabase
              .from("campaigns")
              .update({ daily_budget: newBudgetCents })
              .eq("id", adRow!.campaign_id);

            metaResults.push(
              `Budget scaled on Meta: $${(currentBudgetCents / 100).toFixed(2)} → $${(newBudgetCents / 100).toFixed(2)}`
            );
          } else {
            metaResults.push(`Meta budget update failed: ${metaRes.error}`);
          }
        } else if (!campaignMetaId) {
          metaResults.push("No campaign meta_id — cannot push budget to Meta");
        } else {
          metaResults.push("No current budget found — cannot compute scale amount");
        }

        executionResult = metaResults.length > 0
          ? metaResults.join(". ")
          : "Budget scale flagged but no Meta push possible";
      }

      const { error } = await supabase
        .from("ad_decisions")
        .update({
          status: "executed",
          executed_at: new Date().toISOString(),
          execution_result: executionResult,
        })
        .eq("id", decisionId);

      if (error) {
        return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      }

      return NextResponse.json({ ok: true, status: "executed", result: executionResult });
    }

    return NextResponse.json({ ok: false, error: "Unknown action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
