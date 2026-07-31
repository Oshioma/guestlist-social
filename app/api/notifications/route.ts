// ---------------------------------------------------------------------------
// GET  /api/notifications        → { ok, unread, items: [...] }
// POST /api/notifications        → mark read ({ ids?: number[], all?: true })
//
// Operator-only feed of client portal activity (comments, approvals). Admins
// are auth users with no client_user_links row (getViewer resolves role).
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getViewer } from "@/app/admin-panel/lib/viewer";

export const dynamic = "force-dynamic";

export async function GET() {
  const viewer = await getViewer();
  if (viewer?.role !== "admin") {
    return NextResponse.json({ ok: false, error: "Not authorized" }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("portal_notifications")
    .select("id, client_id, post_id, kind, body, created_at, read_at")
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) {
    // Table missing (pre-migration) — return an empty, non-fatal feed.
    if (error.code === "42P01") {
      return NextResponse.json({ ok: true, unread: 0, items: [] });
    }
    console.error("[notifications] GET error:", error);
    return NextResponse.json({ ok: false, error: "Load failed" }, { status: 500 });
  }

  const rows = data ?? [];
  const clientIds = Array.from(new Set(rows.map((r) => r.client_id)));
  const nameById = new Map<number, string>();
  if (clientIds.length > 0) {
    const { data: clients } = await admin
      .from("clients")
      .select("id, name")
      .in("id", clientIds);
    for (const c of clients ?? []) nameById.set(Number(c.id), String(c.name));
  }

  const items = rows.map((r) => ({
    id: Number(r.id),
    clientId: Number(r.client_id),
    clientName: nameById.get(Number(r.client_id)) ?? "Client",
    postId: r.post_id ? String(r.post_id) : null,
    kind: String(r.kind),
    body: String(r.body),
    createdAt: r.created_at as string,
    read: r.read_at != null,
  }));

  const unread = items.filter((i) => !i.read).length;
  return NextResponse.json({ ok: true, unread, items });
}

export async function POST(request: Request) {
  const viewer = await getViewer();
  if (viewer?.role !== "admin") {
    return NextResponse.json({ ok: false, error: "Not authorized" }, { status: 403 });
  }

  let payload: { ids?: number[]; all?: boolean } = {};
  try {
    payload = await request.json();
  } catch {
    payload = {};
  }

  const admin = createAdminClient();
  const nowIso = new Date().toISOString();

  let query = admin.from("portal_notifications").update({ read_at: nowIso }).is("read_at", null);
  if (!payload.all) {
    const ids = (payload.ids ?? []).map(Number).filter((n) => Number.isFinite(n));
    if (ids.length === 0) {
      return NextResponse.json({ ok: true, updated: 0 });
    }
    query = query.in("id", ids);
  }

  const { error } = await query;
  if (error && error.code !== "42P01") {
    console.error("[notifications] POST error:", error);
    return NextResponse.json({ ok: false, error: "Update failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
