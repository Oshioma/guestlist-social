import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { clientId, campaignId, title, description, priority } = await req.json();

    if (!clientId || !title) {
      return NextResponse.json(
        { ok: false, error: "clientId and title are required" },
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

    const normalizedTitle = (title || "").trim();
    const normalizedDescription = (description || "").trim();
    const signature = campaignId
      ? `[SUGGESTION:${campaignId}:${normalizedTitle}]`
      : `[SUGGESTION:${normalizedTitle}]`;

    // Check for duplicates
    const { data: existing } = await supabase
      .from("actions")
      .select("id, title")
      .eq("client_id", clientId);

    const alreadyExists = (existing ?? []).some((row) =>
      String(row.title ?? "").includes(signature)
    );

    if (alreadyExists) {
      return NextResponse.json({ ok: true, message: "Already exists" });
    }

    // Infer kind
    const text = `${normalizedTitle} ${normalizedDescription}`.toLowerCase();
    let kind = "review";
    if (text.includes("pause")) kind = "pause";
    else if (text.includes("scale")) kind = "scale";
    else if (text.includes("creative") || text.includes("image") || text.includes("headline")) kind = "creative";

    const { error } = await supabase.from("actions").insert({
      client_id: clientId,
      title: `${normalizedTitle} ${signature}`,
      kind,
      priority: priority || "medium",
      status: "open",
      is_complete: false,
      work_note: normalizedDescription || null,
    });

    if (error) {
      return NextResponse.json(
        { ok: false, error: `Insert failed: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
