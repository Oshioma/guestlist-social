// ---------------------------------------------------------------------------
// /portal — landing page.
//
// Client users never see this: middleware bounces them to /portal/{theirClientId}
// the moment they hit any /portal URL. So in practice this page only renders
// for admins, and serves as the "preview as a client" entry point — a list of
// every client with a deep-link into their portal view.
// ---------------------------------------------------------------------------

import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "../admin-panel/lib/viewer";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function PortalRootPage() {
  const viewer = await getViewer();

  // Defense-in-depth: middleware should already have redirected client users,
  // but if anything slipped through, do it again here so the page never leaks
  // a client picker to a non-admin.
  if (viewer?.role === "client") {
    redirect(`/portal/${viewer.clientId}`);
  }

  const supabase = await createClient();
  const { data: clients } = await supabase
    .from("clients")
    .select("id, name, archived")
    .order("name", { ascending: true });

  const active = (clients ?? []).filter((c: any) => !c.archived);

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "48px 24px" }}>
      <div
        style={{
          fontSize: 12,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "#64748b",
          marginBottom: 8,
        }}
      >
        Admin · Client view
      </div>
      <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>
        Preview as a client
      </h1>
      <p
        style={{
          marginTop: 8,
          fontSize: 14,
          color: "#475569",
          lineHeight: 1.6,
        }}
      >
        Pick a client to see exactly what they see when they log into their
        portal. The portal is read-only — no buttons, no forms, just their own
        audit trail, reviews, and top priorities.
      </p>

      <div
        style={{
          marginTop: 28,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
          gap: 12,
        }}
      >
        {active.length === 0 && (
          <div style={{ color: "#94a3b8", fontSize: 13 }}>
            No active clients yet.
          </div>
        )}
        {active.map((c: any) => (
          <Link
            key={c.id}
            href={`/portal/${c.id}`}
            style={{
              display: "block",
              padding: "16px 18px",
              borderRadius: 12,
              background: "#fff",
              border: "1px solid #e2e8f0",
              textDecoration: "none",
              color: "#0f172a",
              fontWeight: 600,
              fontSize: 14,
            }}
          >
            {c.name}
            <div
              style={{
                marginTop: 4,
                fontSize: 11,
                fontWeight: 400,
                color: "#94a3b8",
              }}
            >
              Open portal →
            </div>
          </Link>
        ))}
      </div>

      <div
        style={{
          marginTop: 32,
          paddingTop: 16,
          borderTop: "1px solid #e2e8f0",
        }}
      >
        <Link
          href="/app/dashboard"
          style={{ fontSize: 12, color: "#64748b", textDecoration: "none" }}
        >
          ← Back to admin dashboard
        </Link>
      </div>
    </main>
  );
}
