import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import { createServerClient } from "@supabase/ssr";

import { getRemoteLaunches } from "@/lib/getRemoteLaunches";

export async function POST() {
  // Initialize Supabase SSR client with request context
  const supabase = createServerClient({ cookies, headers });
  const remoteLaunches = await getRemoteLaunches();

  // Clean input, take only needed fields
  const launches = remoteLaunches.map((l: any) => ({
    template_id: l.template_id,
    created_at: l.created_at,
    error_log: l.error_log || null,
  }));

  const { error } = await supabase
    .from("launches")
    .upsert(launches, { onConflict: "template_id" });

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ status: "ok", updated: launches.length });
}
