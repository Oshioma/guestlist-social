import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env vars");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function GET() {
  const supabase = getServiceSupabase();

  // Fetch all columns so we degrade gracefully if ig_handle/archived don't exist yet
  const { data, error } = await supabase
    .from("clients")
    .select("id, name, ig_handle, archived")
    .order("name", { ascending: true });

  console.log("[admin/clients] error:", error);
  console.log("[admin/clients] row count:", data?.length ?? 0);
  console.log("[admin/clients] first row:", data?.[0] ?? null);

  if (error) {
    // ig_handle or archived column may not exist — retry with just id + name
    const fallback = await supabase
      .from("clients")
      .select("id, name")
      .order("name", { ascending: true });

    console.log("[admin/clients] fallback error:", fallback.error);
    console.log("[admin/clients] fallback count:", fallback.data?.length ?? 0);

    const clients = (fallback.data ?? []).map((c) => ({
      id: String(c.id),
      name: String(c.name),
      handle: "",
    }));
    return NextResponse.json({ ok: true, clients });
  }

  const clients = (data ?? [])
    .filter((c) => c.archived !== true)
    .map((c) => ({
      id: String(c.id),
      name: String(c.name),
      handle: c.ig_handle ? `@${String(c.ig_handle).replace(/^@/, "")}` : "",
    }));

  return NextResponse.json({ ok: true, clients });
}
