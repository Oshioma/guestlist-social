import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { campaignId, clientId } = await req.json();

    if (!campaignId || !clientId) {
      return NextResponse.json(
        { ok: false, error: "campaignId and clientId are required" },
        { status: 400 }
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        { ok: false, error: "Missing Supabase env vars" },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: campaign, error: campaignLookupError } = await supabase
      .from("campaigns")
      .select("id")
      .eq("id", campaignId)
      .single();

    if (campaignLookupError || !campaign) {
      return NextResponse.json(
        { ok: false, error: "Campaign not found" },
        { status: 404 }
      );
    }

    const { data: client, error: clientLookupError } = await supabase
      .from("clients")
      .select("id")
      .eq("id", clientId)
      .single();

    if (clientLookupError || !client) {
      return NextResponse.json(
        { ok: false, error: "Client not found" },
        { status: 404 }
      );
    }

    const { error: updateCampaignError } = await supabase
      .from("campaigns")
      .update({ client_id: Number(clientId) })
      .eq("id", campaignId);

    if (updateCampaignError) {
      return NextResponse.json(
        { ok: false, error: `Campaign update failed: ${updateCampaignError.message}` },
        { status: 500 }
      );
    }

    const { error: updateAdsError } = await supabase
      .from("ads")
      .update({ client_id: Number(clientId) })
      .eq("campaign_id", campaignId);

    if (updateAdsError) {
      return NextResponse.json(
        { ok: false, error: `Ads update failed: ${updateAdsError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
