/**
 * GET  /api/client-images?clientId=X  — list all saved images for a client
 * DELETE /api/client-images?id=X      — remove an image (+ storage file if uploaded)
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const clientId = new URL(req.url).searchParams.get("clientId")?.trim();
  if (!clientId) return NextResponse.json({ ok: false, error: "clientId required" }, { status: 400 });

  const { data, error } = await supabase
    .from("client_images")
    .select("id, public_url, source, created_at")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const images = (data ?? []).map((row) => ({
    id: row.id as string,
    publicUrl: row.public_url as string,
    source: row.source as string,
    createdAt: row.created_at as string,
  }));

  return NextResponse.json({ ok: true, images });
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const id = new URL(req.url).searchParams.get("id")?.trim();
  if (!id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });

  const { data: row } = await supabase
    .from("client_images")
    .select("id, storage_path")
    .eq("id", id)
    .single();

  if (!row) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  if (row.storage_path) {
    await supabase.storage.from("gsocial").remove([row.storage_path as string]);
  }

  await supabase.from("client_images").delete().eq("id", id);
  return NextResponse.json({ ok: true });
}
