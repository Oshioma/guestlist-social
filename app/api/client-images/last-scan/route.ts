/**
 * DELETE /api/client-images/last-scan
 *
 * Deletes all client_site_images rows that share the same scan batch as the
 * most recently inserted one (i.e. created within 5 minutes of the newest row).
 *
 * Body: { clientId }
 * Returns: { ok, deleted: number }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase/server";
import { createClient as serviceClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env vars");
  return serviceClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function DELETE(req: NextRequest) {
  const authSupabase = await createClient();
  const { data: { user } } = await authSupabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const clientId = String(body.clientId ?? "").trim();
  if (!clientId) return NextResponse.json({ ok: false, error: "clientId required" }, { status: 400 });

  const db = getServiceSupabase();

  // Find the most recent created_at for this client's site images
  const { data: newest } = await db
    .from("client_site_images")
    .select("created_at")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!newest) {
    return NextResponse.json({ ok: true, deleted: 0 });
  }

  // Delete everything inserted within 5 minutes of that newest row
  // (all rows from one scan run will cluster tightly together)
  const batchCutoff = new Date(newest.created_at);
  batchCutoff.setMinutes(batchCutoff.getMinutes() - 5);

  const { data: deleted, error } = await db
    .from("client_site_images")
    .delete()
    .eq("client_id", clientId)
    .gte("created_at", batchCutoff.toISOString())
    .select("id");

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, deleted: (deleted ?? []).length });
}
