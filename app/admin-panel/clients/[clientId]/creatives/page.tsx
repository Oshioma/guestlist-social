/**
 * Per-client creative library.
 *
 * Reads directly from the `ads` table — same source as the agency-wide
 * /app/creative library — rather than the legacy `creatives` table, which
 * was a manual-upload placeholder that meta-sync never populates. The
 * symptom of reading from the wrong table was that this page sat empty
 * for every real client even when the agency view had hundreds of cards.
 *
 * Each card shows the actual ad creative thumbnail (image first, video
 * poster as fallback), the headline + first line of body, the key
 * delivery metrics, and a click-through to the per-ad audit page.
 */

import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import EmptyState from "@/app/admin-panel/components/EmptyState";
import {
  getAppPerformanceStatus,
  type AppPerformanceStatus,
} from "@/app/admin-panel/lib/performance-truth";

export const dynamic = "force-dynamic";

type AdRow = {
  id: number;
  client_id: number;
  name: string;
  status: string | null;
  meta_status: string | null;
  performance_status: string | null;
  performance_reason: string | null;
  performance_score: number | null;
  creative_image_url: string | null;
  creative_video_url: string | null;
  creative_body: string | null;
  creative_headline: string | null;
  creative_cta: string | null;
  creative_type: string | null;
  spend: number | null;
  impressions: number | null;
  clicks: number | null;
  conversions: number | null;
  cost_per_result: number | null;
  ctr: number | null;
  cpc: number | null;
  created_at: string;
};

function firstLine(body: string | null): string | null {
  if (!body) return null;
  const trimmed = body.trim();
  if (!trimmed) return null;
  const chunk = trimmed.split(/\n+/)[0];
  return chunk.length > 140 ? chunk.slice(0, 140) + "…" : chunk;
}

export default async function ClientCreativesPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  const supabase = await createClient();

  const [clientRes, adsRes] = await Promise.all([
    supabase.from("clients").select("id, name").eq("id", clientId).single(),
    supabase
      .from("ads")
      .select(
        "id, client_id, name, status, meta_status, performance_status, performance_reason, performance_score, creative_image_url, creative_video_url, creative_body, creative_headline, creative_cta, creative_type, spend, impressions, clicks, conversions, cost_per_result, ctr, cpc, created_at"
      )
      .eq("client_id", clientId)
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  if (clientRes.error || !clientRes.data) {
    return <EmptyState title="Client not found" />;
  }

  const client = clientRes.data;
  const ads = (adsRes.data ?? []) as AdRow[];

  // Sort: ads with a thumbnail first so the wall doesn't lead with
  // "no preview" placeholders.
  const sorted = [...ads].sort((a, b) => {
    const aHas = Boolean(a.creative_image_url || a.creative_video_url);
    const bHas = Boolean(b.creative_image_url || b.creative_video_url);
    if (aHas !== bHas) return aHas ? -1 : 1;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  const withPreview = ads.filter(
    (a) => a.creative_image_url || a.creative_video_url
  ).length;

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>
          {client.name} — Creatives
        </h2>
        <p style={{ margin: "4px 0 0", fontSize: 12, color: "#71717a" }}>
          {ads.length} ads from Meta · {withPreview} with previews available
        </p>
      </div>

      {ads.length === 0 ? (
        <EmptyState
          title="No ads synced yet"
          description="Run a Meta sync for this client to populate the creative library."
        />
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
            gap: 16,
          }}
        >
          {sorted.map((ad) => (
            <ClientCreativeCard key={ad.id} ad={ad} clientId={clientId} />
          ))}
        </div>
      )}
    </div>
  );
}

// Status pill colours match the rest of the dashboard so a "winner" here
// looks identical to a "winner" on the ads page.
const STATUS_PILLS: Record<
  AppPerformanceStatus,
  { label: string; bg: string; text: string }
> = {
  winner: { label: "Winner", bg: "#dcfce7", text: "#166534" },
  losing: { label: "Losing", bg: "#fee2e2", text: "#991b1b" },
  testing: { label: "Testing", bg: "#fef3c7", text: "#92400e" },
  paused: { label: "Paused", bg: "#f4f4f5", text: "#71717a" },
};

function fmtMoney(n: number): string {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${n.toFixed(n >= 100 ? 0 : 2)}`;
}
function fmtCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function ClientCreativeCard({
  ad,
  clientId,
}: {
  ad: AdRow;
  clientId: string;
}) {
  const hook = firstLine(ad.creative_body);

  const spend = Number(ad.spend ?? 0);
  const impressions = Number(ad.impressions ?? 0);
  const clicks = Number(ad.clicks ?? 0);
  const conversions = Number(ad.conversions ?? 0);
  const ctr =
    ad.ctr ??
    (impressions > 0 ? Number(((clicks / impressions) * 100).toFixed(2)) : 0);
  const cpc = ad.cpc ?? (clicks > 0 ? Number((spend / clicks).toFixed(2)) : 0);
  const costPerResult = Number(ad.cost_per_result ?? 0);

  // Live-fall-back the same way the ads page does, so an ad that's never
  // been Score-Ads'd still gets a meaningful pill instead of a blank.
  const liveStatus = getAppPerformanceStatus({
    status: ad.status,
    meta_status: ad.meta_status,
    spend,
    impressions,
    clicks,
    ctr,
    cpc,
    conversions,
    cost_per_result: costPerResult,
  });
  const status =
    (ad.performance_status as AppPerformanceStatus | null) ?? liveStatus;
  const pill = STATUS_PILLS[status] ?? STATUS_PILLS.testing;

  return (
    <Link
      href={`/app/clients/${clientId}/ads/${ad.id}`}
      style={{
        textDecoration: "none",
        color: "inherit",
        display: "block",
      }}
    >
      <div
        style={{
          border: "1px solid #e4e4e7",
          borderRadius: 12,
          background: "#fff",
          overflow: "hidden",
          transition: "box-shadow 0.15s ease",
        }}
      >
        {/* Preview pane: image > video poster > placeholder */}
        <div
          style={{
            position: "relative",
            height: 180,
            background: "#f4f4f5",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#a1a1aa",
            fontSize: 13,
          }}
        >
          {ad.creative_image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={ad.creative_image_url}
              alt={ad.creative_headline ?? ad.name}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
              }}
            />
          ) : ad.creative_video_url ? (
            <video
              src={ad.creative_video_url}
              controls
              muted
              playsInline
              preload="metadata"
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                background: "#000",
              }}
            />
          ) : (
            <span>No preview</span>
          )}
          {/* Status pill overlays the preview so the headline summary is
              the first thing the operator sees on every card */}
          <span
            style={{
              position: "absolute",
              top: 10,
              left: 10,
              padding: "3px 10px",
              borderRadius: 999,
              fontSize: 11,
              fontWeight: 700,
              background: pill.bg,
              color: pill.text,
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
            }}
          >
            {pill.label}
            {ad.performance_score != null ? ` · ${ad.performance_score}` : ""}
          </span>
        </div>

        <div style={{ padding: 14 }}>
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: "#18181b",
              lineHeight: 1.35,
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {ad.creative_headline ?? ad.name}
          </div>
          {hook && (
            <div
              style={{
                marginTop: 6,
                fontSize: 12,
                color: "#52525b",
                lineHeight: 1.45,
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
            >
              {hook}
            </div>
          )}

          {/* Metric grid: spend / CTR / CPC / conversions. Two rows of two
              so the numbers stay readable at narrow card widths. */}
          <div
            style={{
              marginTop: 12,
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 8,
              padding: "10px 12px",
              background: "#fafafa",
              border: "1px solid #f4f4f5",
              borderRadius: 8,
            }}
          >
            <Metric label="Spend" value={spend > 0 ? fmtMoney(spend) : "—"} />
            <Metric label="CTR" value={ctr > 0 ? `${ctr.toFixed(2)}%` : "—"} />
            <Metric
              label="CPC"
              value={cpc > 0 ? `$${cpc.toFixed(2)}` : "—"}
            />
            <Metric
              label="Conv"
              value={
                conversions > 0
                  ? costPerResult > 0
                    ? `${fmtCount(conversions)} · $${costPerResult.toFixed(2)}`
                    : fmtCount(conversions)
                  : "—"
              }
            />
          </div>

          {/* Why we judged it that way — falls back to live impressions
              count when the engine hasn't reasoned about it yet. */}
          <div
            style={{
              marginTop: 10,
              fontSize: 11,
              color: "#71717a",
              lineHeight: 1.4,
              minHeight: 14,
            }}
          >
            {ad.performance_reason ??
              (impressions > 0
                ? `${fmtCount(impressions)} impressions`
                : "No delivery yet")}
          </div>

          <div
            style={{
              marginTop: 8,
              display: "flex",
              gap: 8,
              fontSize: 11,
              color: "#a1a1aa",
              flexWrap: "wrap",
            }}
          >
            <span>{ad.creative_type ?? "—"}</span>
            <span style={{ color: "#e4e4e7" }}>·</span>
            <span>{ad.status ?? "unknown"}</span>
          </div>
        </div>
      </div>
    </Link>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div
        style={{
          fontSize: 10,
          color: "#a1a1aa",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          fontWeight: 600,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 14,
          fontWeight: 700,
          color: "#18181b",
          marginTop: 1,
        }}
      >
        {value}
      </div>
    </div>
  );
}
