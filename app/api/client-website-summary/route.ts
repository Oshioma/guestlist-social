/**
 * POST /api/client-website-summary
 *
 * Reads a client's website (homepage + a few key pages), has the AI condense
 * it into a brand brief, and saves it on the client as `website_summary`.
 * The post-idea generator and caption rewriter use that brief as brand
 * knowledge, so this runs once (and again whenever the site changes) rather
 * than scraping on every generate.
 *
 * Body:
 *   { clientId, websiteUrl? }   → read the site (websiteUrl also saved on the client)
 *   { clientId, summary }       → save a hand-edited brief
 *
 * Staff, or an owner/admin of a team the client belongs to.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { canManageClientAccount } from "@/app/admin-panel/lib/meta-attach";
import {
  normalizeWebsiteUrl,
  scrapeWebsite,
  summarizeWebsite,
} from "@/lib/website-summary";

export const dynamic = "force-dynamic";
// Several page fetches plus a model call.
export const maxDuration = 120;

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Please sign in." }, { status: 401 });

  let body: { clientId?: unknown; websiteUrl?: unknown; summary?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }
  const clientId = Number(body.clientId);
  if (!Number.isInteger(clientId) || clientId <= 0) {
    return NextResponse.json({ ok: false, error: "clientId required." }, { status: 400 });
  }

  const { data: roleRow } = await supabase
    .from("user_roles")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  const allowed = await canManageClientAccount(user.id, clientId, !!roleRow);
  if (!allowed) {
    return NextResponse.json({ ok: false, error: "You can't edit this client." }, { status: 403 });
  }

  // Service role from here on — access to this one client was checked above.
  const admin = createAdminClient();

  // Manual save of an edited brief.
  if (typeof body.summary === "string") {
    const summary = body.summary.trim().slice(0, 8000);
    const { error } = await admin
      .from("clients")
      .update({ website_summary: summary || null, website_summary_at: new Date().toISOString() })
      .eq("id", clientId);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, summary });
  }

  const { data: client } = await admin
    .from("clients")
    .select("name, website_url")
    .eq("id", clientId)
    .single();
  if (!client) return NextResponse.json({ ok: false, error: "Client not found." }, { status: 404 });

  const rawUrl = typeof body.websiteUrl === "string" ? body.websiteUrl : client.website_url ?? "";
  const websiteUrl = normalizeWebsiteUrl(rawUrl);
  if (!websiteUrl) {
    return NextResponse.json(
      { ok: false, error: "Add the client's website address first." },
      { status: 400 }
    );
  }

  try {
    const scrape = await scrapeWebsite(websiteUrl);
    const summary = await summarizeWebsite(client.name ?? "this business", scrape);
    const readAt = new Date().toISOString();
    const { error } = await admin
      .from("clients")
      .update({ website_url: websiteUrl, website_summary: summary, website_summary_at: readAt })
      .eq("id", clientId);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({
      ok: true,
      summary,
      websiteUrl,
      readAt,
      pagesRead: scrape.pages.map((p) => p.url),
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Couldn't read the website." },
      { status: 502 }
    );
  }
}
