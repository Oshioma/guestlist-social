/**
 * POST /api/client-images/drive-import
 *
 * Imports images from a publicly-shared Google Drive folder into client_site_images.
 * The folder must be set to "Anyone with the link can view".
 *
 * Body: { clientId: string, folderUrl: string }
 * Returns: { ok: true, added: number, skipped: number, images: ClientImage[] }
 */

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 1000;
const MAX_IMAGES = 500;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env vars.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function extractFolderId(input: string): string | null {
  // Handle folder IDs pasted directly
  if (/^[a-zA-Z0-9_-]{25,}$/.test(input.trim())) return input.trim();
  try {
    const url = new URL(input.trim());
    // https://drive.google.com/drive/folders/{id}
    const folderMatch = url.pathname.match(/\/folders\/([a-zA-Z0-9_-]+)/);
    if (folderMatch) return folderMatch[1];
    // https://drive.google.com/drive/u/0/folders/{id}
    const uMatch = url.pathname.match(/\/u\/\d+\/folders\/([a-zA-Z0-9_-]+)/);
    if (uMatch) return uMatch[1];
  } catch {
    // not a URL
  }
  return null;
}

function driveImageUrl(fileId: string): string {
  return `https://lh3.googleusercontent.com/d/${fileId}`;
}

function dedupeKey(url: string): string {
  // For Drive URLs, the file ID is the stable key
  const driveMatch = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (driveMatch) return `drive:${driveMatch[1]}`;
  return url;
}

export async function POST(req: Request) {
  try {
    const apiKey = process.env.GOOGLE_DRIVE_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { ok: false, error: "GOOGLE_DRIVE_API_KEY not configured. Add it to your environment variables." },
        { status: 500 }
      );
    }

    const body = await req.json();
    const clientId = String(body.clientId ?? "").trim();
    const folderUrl = String(body.folderUrl ?? "").trim();

    if (!clientId) return NextResponse.json({ ok: false, error: "clientId required." }, { status: 400 });
    if (!folderUrl) return NextResponse.json({ ok: false, error: "folderUrl required." }, { status: 400 });

    const folderId = extractFolderId(folderUrl);
    if (!folderId) {
      return NextResponse.json(
        { ok: false, error: "Could not extract a folder ID from that URL. Make sure you're pasting a Google Drive folder link." },
        { status: 400 }
      );
    }

    // Fetch image files from the Drive folder (one page, up to 1000)
    const params = new URLSearchParams({
      q: `'${folderId}' in parents and mimeType contains 'image/' and trashed = false`,
      fields: "files(id,name,mimeType),nextPageToken",
      pageSize: String(PAGE_SIZE),
      key: apiKey,
    });

    const driveRes = await fetch(
      `https://www.googleapis.com/drive/v3/files?${params.toString()}`
    );

    if (!driveRes.ok) {
      const errBody = await driveRes.json().catch(() => ({}));
      const msg = (errBody as { error?: { message?: string } })?.error?.message ?? driveRes.statusText;
      if (driveRes.status === 403 || driveRes.status === 404) {
        return NextResponse.json(
          { ok: false, error: `Drive API error: ${msg}. Make sure the folder is shared as "Anyone with the link can view".` },
          { status: 400 }
        );
      }
      return NextResponse.json({ ok: false, error: `Drive API error: ${msg}` }, { status: 500 });
    }

    const driveData = await driveRes.json() as { files: { id: string; name: string; mimeType: string }[] };
    const files = driveData.files ?? [];

    if (files.length === 0) {
      return NextResponse.json({ ok: true, added: 0, skipped: 0, images: [] });
    }

    const db = getSupabase();

    // Load existing image URLs to skip duplicates
    const { data: existing } = await db
      .from("client_site_images")
      .select("public_url")
      .eq("client_id", clientId);

    const existingKeys = new Set((existing ?? []).map((r: { public_url: string }) => dedupeKey(r.public_url)));

    const toInsert = files
      .slice(0, MAX_IMAGES)
      .map((f) => ({ fileId: f.id, url: driveImageUrl(f.id) }))
      .filter(({ url }) => !existingKeys.has(dedupeKey(url)))
      .map(({ url }) => ({ client_id: clientId, public_url: url }));

    const skipped = files.length - toInsert.length;

    if (toInsert.length === 0) {
      return NextResponse.json({ ok: true, added: 0, skipped, images: [] });
    }

    const { data: inserted, error: insertError } = await db
      .from("client_site_images")
      .insert(toInsert)
      .select("id, public_url");

    if (insertError) {
      return NextResponse.json({ ok: false, error: insertError.message }, { status: 500 });
    }

    const images = (inserted ?? []).map((row: { id: string; public_url: string }) => ({
      id: String(row.id),
      publicUrl: row.public_url,
      table: "site" as const,
    }));

    return NextResponse.json({ ok: true, added: images.length, skipped, images });
  } catch (err) {
    console.error("drive-import error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Unknown error." },
      { status: 500 }
    );
  }
}
