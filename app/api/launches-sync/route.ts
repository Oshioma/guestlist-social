import { NextResponse } from "next/server";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import { getRemoteLaunches } from "@/lib/getRemoteLaunches";

export async function POST() {
  const supabase = createServerComponentClient();
  const launches = await getRemoteLaunches();

  // Only keep fields you want
  const cleaned = launches.map((l: any) => ({
    template_id: l.template_id,
    created_at: l.created_at,
    error_log: l.error_log || null,
  }));

  // Upsert into your Supabase table (e.g., "launches")
  const { error } = await supabase.from("launches").upsert(cleaned, { onConflict: "template_id" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ status: "ok", updated: cleaned.length });
}
