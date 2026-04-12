// ---------------------------------------------------------------------------
// /portal/[clientId]/ads — read-only ad list.
//
// Bare list of every ad belonging to the client. Each row links to the audit
// trail. We surface a "calm" performance label rather than the operator's
// winner/losing/testing badge — same data, gentler language.
// ---------------------------------------------------------------------------

import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { canViewClient, getViewer } from "../../../admin-panel/lib/viewer";
import { getAppPerformanceStatus } from "../../../admin-panel/lib/performance-truth";

export const dynamic = "force-dynamic";

const STATUS_COPY: Record<string, { label: string; bg: string; fg: string }> = {
  winner: { label: "Performing well", bg: "#dcfce7", fg: "#166534" },
  losing: { label: "Needs attention", bg: "#fee2e2", fg: "#991b1b" },
  testing: { label: "Still testing", bg: "#fef3c7", fg: "#92400e" },
  paused: { label: "Paused", bg: "#f1f5f9", fg: "#475569" },
};

export default async function PortalAdsPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId: rawClientId } = await params;
  const clientId = Number(rawClientId);

  const viewer = await getViewer();
  if (!canViewClient(viewer, clientId)) notFound();

  const supabase = await createClient();
  const { data: ads } = await supabase
    .from("ads")
    .select(
      "id, name, status, meta_status, spend, impressions, clicks, conversions, cost_per_result, audience"
    )
    .eq("client_id", clientId)
    .order("created_at", { ascending: false });

  const rows = (ads ?? []) as any[];

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
          Ads
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: "6px 0 0", color: "#0f172a" }}>
          Every ad we&rsquo;re running for you
        </h1>
        <p style={{ margin: "8px 0 0", fontSize: 13, color: "#475569", lineHeight: 1.6, maxWidth: 640 }}>
          Click any ad to see its full audit trail — every action, decision,
          and learning your operator has recorded for it, in order.
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
          No ads yet.
        </div>
      ) : (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
            background: "#fff",
            border: "1px solid #e2e8f0",
            borderRadius: 12,
            padding: 8,
          }}
        >
          {rows.map((ad) => {
            const impressions = Number(ad.impressions ?? 0);
            const clicks = Number(ad.clicks ?? 0);
            const ctr =
              impressions > 0
                ? Number(((clicks / impressions) * 100).toFixed(2))
                : 0;
            const cpc = clicks > 0 ? Number((Number(ad.spend ?? 0) / clicks).toFixed(2)) : 0;
            const status = getAppPerformanceStatus({
              status: ad.status,
              meta_status: ad.meta_status,
              spend: Number(ad.spend ?? 0),
              impressions,
              clicks,
              ctr,
              cpc,
              conversions: Number(ad.conversions ?? 0),
              cost_per_result: Number(ad.cost_per_result ?? 0),
            });
            const copy = STATUS_COPY[status] ?? STATUS_COPY.testing;

            return (
              <Link
                key={ad.id}
                href={`/portal/${clientId}/ads/${ad.id}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 16,
                  padding: "14px 16px",
                  borderRadius: 10,
                  textDecoration: "none",
                  color: "inherit",
                  background: "#fff",
                  border: "1px solid transparent",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#0f172a" }}>
                    {ad.name}
                  </div>
                  {ad.audience && (
                    <div style={{ marginTop: 2, fontSize: 12, color: "#94a3b8" }}>
                      {ad.audience}
                    </div>
                  )}
                </div>
                <div
                  style={{
                    display: "flex",
                    gap: 16,
                    fontSize: 12,
                    color: "#64748b",
                    flexShrink: 0,
                  }}
                >
                  <span>
                    <span style={{ color: "#94a3b8" }}>Spend</span>{" "}
                    <strong style={{ color: "#0f172a" }}>${Number(ad.spend ?? 0).toFixed(0)}</strong>
                  </span>
                  <span>
                    <span style={{ color: "#94a3b8" }}>CTR</span>{" "}
                    <strong style={{ color: "#0f172a" }}>{ctr > 0 ? `${ctr}%` : "—"}</strong>
                  </span>
                  <span>
                    <span style={{ color: "#94a3b8" }}>Conv</span>{" "}
                    <strong style={{ color: "#0f172a" }}>{Number(ad.conversions ?? 0)}</strong>
                  </span>
                </div>
                <span
                  style={{
                    padding: "4px 12px",
                    borderRadius: 999,
                    background: copy.bg,
                    color: copy.fg,
                    fontSize: 11,
                    fontWeight: 600,
                    flexShrink: 0,
                  }}
                >
                  {copy.label}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
