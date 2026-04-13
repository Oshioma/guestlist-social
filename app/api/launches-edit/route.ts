import { NextResponse } from "next/server";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";

// This API endpoint expects a POST JSON body: { template_id: string, error_log: string | null }
export async function POST(req: Request) {
  const { template_id, error_log } = await req.json();

  const supabase = createServerComponentClient();

  const { error } = await supabase
    .from("launches")
    .update({ error_log })
    .eq("template_id", template_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ status: "ok" });
}
