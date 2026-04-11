import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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
      // For now: mark as executed and apply DB-side changes
      // Meta API push can be added later
      let executionResult = "Executed locally";

      if (decision.type === "pause_or_replace" || decision.type === "kill_test") {
        // Update ad status in DB
        const { error: adError } = await supabase
          .from("ads")
          .update({ status: "paused", meta_status: "PAUSED" })
          .eq("id", decision.ad_id);

        executionResult = adError
          ? `DB update failed: ${adError.message}`
          : "Ad paused in database";
      }

      if (decision.type === "scale_budget") {
        // We can't change budget without Meta API, just note it
        executionResult = "Budget increase flagged. Apply manually in Meta Ads Manager.";
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
