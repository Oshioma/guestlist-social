import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../lib/supabase/server";

const DEFAULT_BUCKET = "gsocial";
const ALLOWED_BUCKETS = new Set(["gsocial", "postimages"]);
const MAX_SIZE = 10 * 1024 * 1024; // 10 MB

export async function POST(req: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const folder = (formData.get("folder") as string) || "general";
  const requestedBucket = (formData.get("bucket") as string) || DEFAULT_BUCKET;
  const bucket = ALLOWED_BUCKETS.has(requestedBucket)
    ? requestedBucket
    : DEFAULT_BUCKET;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  if (file.size > MAX_SIZE) {
    return NextResponse.json(
      { error: "File too large (max 10 MB)" },
      { status: 400 }
    );
  }

  const allowed = ["image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml"];
  if (!allowed.includes(file.type)) {
    return NextResponse.json(
      { error: "Only JPEG, PNG, GIF, WebP and SVG images are allowed" },
      { status: 400 }
    );
  }

  const ext = file.name.split(".").pop() || "jpg";
  const timestamp = Date.now();
  const safeName = file.name
    .replace(/\.[^/.]+$/, "")
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 60);
  const path = `${folder}/${timestamp}_${safeName}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(path, file, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) {
    console.error("Upload error:", uploadError);
    return NextResponse.json(
      { error: uploadError.message },
      { status: 500 }
    );
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(bucket).getPublicUrl(path);

  return NextResponse.json({ url: publicUrl, path });
}
