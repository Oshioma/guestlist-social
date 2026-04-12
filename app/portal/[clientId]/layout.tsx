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
  const { data: client } = await supabase
    .from("clients")
    .select("id, name")
    .eq("id", clientId)
    .single();
  if (!client) notFound();

  return (
    <div className="portal-shell">
      <PortalSidebar
        clientId={clientId}
        clientName={(client as { name: string }).name}
        isAdminPreview={viewer?.role === "admin"}
      />
      <div className="portal-main">
        <main style={{ flex: 1, padding: 32, maxWidth: 1100, width: "100%" }}>
          {children}
        </main>
      </div>
    </div>
  );
}
