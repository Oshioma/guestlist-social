import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { fetchDueInsights } from "@/lib/post-insights";

export const dynamic = "force-dynamic";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function GET() {
  try {
    const supabase = getSupabase();
    const result = await fetchDueInsights(supabase, { limit: 50 });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST() {
  return GET();
}
