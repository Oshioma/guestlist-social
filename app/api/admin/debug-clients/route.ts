import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ error: "Missing env vars" }, { status: 500 });

  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: accountRows, error: e1 } = await db
    .from("connected_meta_accounts")
    .select("client_id, platform, account_name");

  const connectedIds = [...new Set((accountRows ?? []).map((r) => r.client_id))];

  const { data: clients, error: e2 } = await db
    .from("clients")
    .select("id, name, ig_handle, archived")
    .in("id", connectedIds.length ? connectedIds : [-1]);

  return NextResponse.json({
    accountRows,
    accountRowsError: e1,
    connectedIds,
    clients,
    clientsError: e2,
  });
}
