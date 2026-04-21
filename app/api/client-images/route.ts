/**
 * GET  /api/client-images?clientId=X
 *   Returns all images for a client from both client_site_images and
 *   client_upload_images, merged and sorted newest-first.
 *
 * DELETE /api/client-images?id=X&table=site|upload
 *   Removes one image. Pass table=upload to target client_upload_images
 *   (also deletes the file from Supabase Storage); default is site.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../lib/supabase/server";
import { createClient as serviceClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env vars");
  return serviceClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function GET(req: NextRequest) {
  // Auth check via user client
  const authSupabase = await createClient();
  const { data: { user } } = await authSupabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const clientId = new URL(req.url).searchParams.get("clientId")?.trim();
  if (!clientId) return NextResponse.json({ ok: false, error: "clientId required" }, { status: 400 });

  // Use service client so RLS never blocks the read
  const db = getServiceSupabase();

  const [siteRes, uploadRes] = await Promise.all([
    db
      .from("client_site_images")
      .select("id, public_url, created_at")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false }),
    db
      .from("client_upload_images")
      .select("id, public_url, created_at")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false }),
  ]);

  if (siteRes.error) return NextResponse.json({ ok: false, error: siteRes.error.message }, { status: 500 });
  if (uploadRes.error) return NextResponse.json({ ok: false, error: uploadRes.error.message }, { status: 500 });

  const siteImages = (siteRes.data ?? []).map((r) => ({
    id: r.id as string,
    publicUrl: r.public_url as string,
    table: "site" as const,
    createdAt: r.created_at as string,
  }));

  const uploadImages = (uploadRes.data ?? []).map((r) => ({
    id: r.id as string,
    publicUrl: r.public_url as string,
    table: "upload" as const,
    createdAt: r.created_at as string,
  }));

  const images = [...uploadImages, ...siteImages].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  return NextResponse.json({ ok: true, images });
}

export async function DELETE(req: NextRequest) {
  const authSupabase = await createClient();
  const { data: { user } } = await authSupabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const params = new URL(req.url).searchParams;
  const id = params.get("id")?.trim();
  const table = params.get("table") === "upload" ? "client_upload_images" : "client_site_images";
  if (!id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });

  const db = getServiceSupabase();

  if (table === "client_upload_images") {
    const { data: row } = await db
      .from("client_upload_images")
      .select("id, storage_path")
      .eq("id", id)
      .single();

    if (!row) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    if (row.storage_path) {
      await authSupabase.storage.from("gsocial").remove([row.storage_path as string]);
    }
  }

  await db.from(table).delete().eq("id", id);
  return NextResponse.json({ ok: true });
}
