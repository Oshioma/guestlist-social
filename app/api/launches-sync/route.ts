import { NextResponse } from "next/server";
import { getRemoteLaunches } from "@/lib/getRemoteLaunches";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";

// Adjust Supabase import/setup as needed for your project!

export async function POST() {
  const supabase = createServerComponentClient();
  const launches = await getRemoteLaunches();

  // Only select the fields you care about
  const cleaned = launches.map((l: any) => ({
    template_id: l.template_id,
    created_at: l.created_at,
    error_log: l.error_log || null,
  }));

  // Upsert to Supabase ("template_id" is unique)
  const { error } = await supabase
    .from("launches")
    .upsert(cleaned, { onConflict: "template_id" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ status: "ok", updated: cleaned.length });
}
