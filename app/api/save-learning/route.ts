import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { actionId, adId, problem, changeMade, result, outcome } = body;

    if (!problem || !changeMade) {
      return NextResponse.json(
        { ok: false, error: "Problem and change are required." },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    const { data: ad } = await supabase
      .from("ads")
      .select("client_id, campaign_id")
      .eq("id", adId)
      .maybeSingle();

    const { error } = await supabase.from("learnings").insert({
      client_id: ad?.client_id ?? null,
      campaign_id: ad?.campaign_id ?? null,
      ad_id: adId ?? null,
      action_id: actionId ?? null,
      problem,
      change_made: changeMade,
      result: result || null,
      outcome: outcome || "neutral",
    });

    if (error) {
      console.error("save-learning error:", error);
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
