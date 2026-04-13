import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Set up Supabase client with your environment variables
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  // You may want to filter clients by access rules in the future
  const { data, error } = await supabase
    .from("clients")
    .select("id, name")
    .order("name", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Optionally, filter by user’s rights if needed before returning
  return NextResponse.json(data ?? []);
}
