import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

// GET /api/job-status?id=123
// GET /api/job-status?type=full_refresh            → latest run of that type
// GET /api/job-status?type=client_refresh&client=4 → latest run for a client
export async function GET(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return NextResponse.json(
      { ok: false, error: "Missing env vars" },
      { status: 500 }
    );
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  const type = searchParams.get("type");
  const clientId = searchParams.get("client");

  let query = supabase
    .from("jobs")
    .select(
      "id, type, client_id, status, steps, result_summary, error, started_at, finished_at, created_at"
    );

  if (id) {
    query = query.eq("id", Number(id));
  } else {
    if (type) query = query.eq("type", type);
    if (clientId) query = query.eq("client_id", Number(clientId));
  }

  const { data, error } = await query
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, job: data });
}
