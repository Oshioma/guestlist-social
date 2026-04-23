import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("clients")
    .select("id, name, ig_handle")
    .eq("archived", false)
    .order("name", { ascending: true });

  const clients = (data ?? []).map((c) => ({
    id: String(c.id),
    name: String(c.name),
    handle: c.ig_handle ? `@${String(c.ig_handle).replace(/^@/, "")}` : "",
  }));

  return NextResponse.json({ ok: true, clients });
}
