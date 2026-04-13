import { NextResponse } from "next/server";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";

// This API route expects a JSON POST: { template_id: string, error_log: string|null }
export async function POST(req: Request) {
  // Parse JSON body
  const { template_id, error_log } = await req.json();

  // Initialize Supabase client (server side, uses cookies/env by default)
  const supabase = createServerComponentClient();

  // Update the matching launch record
  const { error } = await supabase
    .from("launches")
    .update({ error_log })
    .eq("template_id", template_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // OK response for success
  return NextResponse.json({ status: "ok" });
}
