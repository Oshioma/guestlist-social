// ---------------------------------------------------------------------------
// /portal/[clientId]/reviews — list of sent + approved reviews.
//
// We deliberately omit drafts. Drafts are the operator's working surface; the
// portal is the public-facing trust artifact, and exposing a half-written
// review would be louder than calmer. Once an operator hits "Send", it shows
// up here.
// ---------------------------------------------------------------------------

import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { canViewClient, getViewer } from "../../../admin-panel/lib/viewer";

export const dynamic = "force-dynamic";

const STATUS_COPY: Record<string, { label: string; bg: string; fg: string }> = {
  sent: { label: "Awaiting approval", bg: "#fef3c7", fg: "#92400e" },
  approved: { label: "Approved", bg: "#dcfce7", fg: "#166534" },
};

export default async function PortalReviewsPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId: rawClientId } = await params;
  const clientId = Number(rawClientId);

  const viewer = await getViewer();
  if (!canViewClient(viewer, clientId)) notFound();

  const supabase = await createClient();
  const { data: reviews } = await supabase
    .from("reviews")
    .select("id, period_label, period_type, headline, status, sent_at, approved_at")
    .eq("client_id", clientId)
    .in("status", ["sent", "approved"])
    .order("period_end", { ascending: false });

  const rows = (reviews ?? []) as any[];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div>
        <div
          style={{
            fontSize: 12,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            color: "#64748b",
          }}
        >
          Reviews
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: "6px 0 0", color: "#0f172a" }}>
          Your reviews
        </h1>
        <p style={{ margin: "8px 0 0", fontSize: 13, color: "#475569", lineHeight: 1.6, maxWidth: 640 }}>
          Each review is a 60-second narrative of what happened, what improved,
          what we tested, what we learned, and what we&rsquo;re doing next.
          Open one to read it in full.
        </p>
      </div>

      {rows.length === 0 ? (
        <div
          style={{
            padding: 36,
            textAlign: "center",
            background: "#fff",
            border: "1px solid #e2e8f0",
            borderRadius: 12,
            color: "#94a3b8",
            fontSize: 14,
          }}
        >
          No reviews have been sent yet.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {rows.map((r) => {
            const copy = STATUS_COPY[r.status] ?? STATUS_COPY.sent;
            return (
              <Link
                key={r.id}
                href={`/portal/${clientId}/reviews/${r.id}`}
                style={{
                  display: "block",
                  padding: 20,
                  background: "#fff",
                  border: "1px solid #e2e8f0",
                  borderRadius: 12,
                  textDecoration: "none",
                  color: "inherit",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    marginBottom: 6,
                  }}
                >
                  <span
                    style={{
                      fontSize: 11,
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      color: "#64748b",
                      fontWeight: 600,
                    }}
                  >
                    {r.period_label} · {r.period_type}
                  </span>
                  <span
                    style={{
                      padding: "3px 10px",
                      borderRadius: 999,
                      background: copy.bg,
                      color: copy.fg,
                      fontSize: 10,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.04em",
                    }}
                  >
                    {copy.label}
                  </span>
                </div>
                <div
                  style={{
                    fontSize: 17,
                    fontWeight: 700,
                    color: "#0f172a",
                    lineHeight: 1.3,
                  }}
                >
                  {r.headline ?? "Review"}
                </div>
                <div
                  style={{
                    marginTop: 10,
                    fontSize: 12,
                    color: "#94a3b8",
                  }}
                >
                  {r.approved_at
                    ? `Approved ${new Date(r.approved_at).toLocaleDateString()}`
                    : r.sent_at
                    ? `Sent ${new Date(r.sent_at).toLocaleDateString()}`
                    : null}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
