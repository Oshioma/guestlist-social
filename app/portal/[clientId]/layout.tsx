// ---------------------------------------------------------------------------
// Per-client portal layout.
//
// Sidebar (Dashboard / Ads / Reviews) + main column. Also runs the
// canViewClient gate so a client user can never see another client's data
// even if they fiddle with the URL — middleware redirects them, but the page
// gate is the ultimate guarantee.
// ---------------------------------------------------------------------------

import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { canViewClient, getViewer } from "../../admin-panel/lib/viewer";
import PortalSidebar from "./PortalSidebar";

export default async function PortalClientLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ clientId: string }>;
}) {
  const { clientId: rawClientId } = await params;
  const clientId = Number(rawClientId);
  if (!Number.isFinite(clientId)) notFound();

  const viewer = await getViewer();
  if (!canViewClient(viewer, clientId)) {
    notFound();
  }

  const supabase = await createClient();
  const primary = await supabase
    .from("clients")
    .select(
      "id, name, portal_show_content, portal_show_ads, portal_show_reviews, portal_show_consultation"
    )
    .eq("id", clientId)
    .single();
  // Pre-migration fallback: if the toggle columns don't exist yet, load the
  // base row so the portal still renders (all sections default to visible).
  let client: Record<string, unknown> | null = primary.data ?? null;
  if (!client) {
    const retry = await supabase
      .from("clients")
      .select("id, name")
      .eq("id", clientId)
      .single();
    client = retry.data ?? null;
  }
  if (!client) notFound();

  const row = client as {
    name: string;
    portal_show_content?: boolean | null;
    portal_show_ads?: boolean | null;
    portal_show_reviews?: boolean | null;
    portal_show_consultation?: boolean | null;
  };
  const visibility = {
    content: row.portal_show_content !== false,
    ads: row.portal_show_ads !== false,
    reviews: row.portal_show_reviews !== false,
    consultation: row.portal_show_consultation !== false,
  };

  return (
    <div className="portal-shell">
      <PortalSidebar
        clientId={clientId}
        clientName={row.name}
        isAdminPreview={viewer?.role === "admin"}
        visibility={visibility}
      />
      <div className="portal-main">
        <main style={{ flex: 1, padding: 32, maxWidth: 1100, width: "100%" }}>
          {children}
        </main>
      </div>
    </div>
  );
}
