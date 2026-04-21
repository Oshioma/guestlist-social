/**
 * POST /api/client-images/upload
 *
 * Uploads an image file to Supabase Storage under clients/{clientId}/
 * and saves a record to client_upload_images.
 *
 * Body: multipart/form-data — fields: file, clientId
 * Returns: { ok, image: { id, publicUrl, table, createdAt } }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase/server";

export const dynamic = "force-dynamic";

const MAX_SIZE = 20 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const clientId = (formData.get("clientId") as string | null)?.trim();

  if (!file) return NextResponse.json({ ok: false, error: "No file provided" }, { status: 400 });
  if (!clientId) return NextResponse.json({ ok: false, error: "clientId required" }, { status: 400 });
  if (file.size > MAX_SIZE) return NextResponse.json({ ok: false, error: "Max file size is 20 MB" }, { status: 400 });
  if (!ALLOWED_TYPES.has(file.type)) return NextResponse.json({ ok: false, error: "Only JPEG, PNG, WebP or GIF" }, { status: 400 });

  const ext = file.name.split(".").pop() ?? "jpg";
  const safeName = file.name
    .replace(/\.[^/.]+$/, "")
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 60);
  const storagePath = `clients/${clientId}/${Date.now()}_${safeName}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("gsocial")
    .upload(storagePath, file, { contentType: file.type, upsert: false });

  if (uploadError) return NextResponse.json({ ok: false, error: uploadError.message }, { status: 500 });

  const { data: { publicUrl } } = supabase.storage.from("gsocial").getPublicUrl(storagePath);

  const { data: row, error: dbError } = await supabase
    .from("client_upload_images")
    .insert({ client_id: clientId, public_url: publicUrl, storage_path: storagePath })
    .select("id, public_url, created_at")
    .single();

  if (dbError) {
    await supabase.storage.from("gsocial").remove([storagePath]);
    return NextResponse.json({ ok: false, error: dbError.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    image: {
      id: row.id as string,
      publicUrl: row.public_url as string,
      table: "upload" as const,
      createdAt: row.created_at as string,
    },
  });
}
