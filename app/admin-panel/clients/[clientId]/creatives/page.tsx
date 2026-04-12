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

export const dynamic = "force-dynamic";

type AdRow = {
  id: number;
  client_id: number;
  name: string;
  status: string | null;
  performance_status: string | null;
  creative_image_url: string | null;
  creative_video_url: string | null;
  creative_body: string | null;
  creative_headline: string | null;
  creative_cta: string | null;
  creative_type: string | null;
  spend: number | null;
  impressions: number | null;
  clicks: number | null;
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
        "id, client_id, name, status, performance_status, creative_image_url, creative_video_url, creative_body, creative_headline, creative_cta, creative_type, spend, impressions, clicks, created_at"
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

function ClientCreativeCard({
  ad,
  clientId,
}: {
  ad: AdRow;
  clientId: string;
}) {
  const hook = firstLine(ad.creative_body);
  const ctr =
    ad.impressions && ad.impressions > 0 && ad.clicks
      ? ((Number(ad.clicks) / Number(ad.impressions)) * 100).toFixed(2)
      : null;

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

          <div
            style={{
              marginTop: 10,
              display: "flex",
              gap: 10,
              fontSize: 11,
              color: "#71717a",
              flexWrap: "wrap",
            }}
          >
            <span>{ad.creative_type ?? "—"}</span>
            <span style={{ color: "#d4d4d8" }}>·</span>
            <span>{ad.status ?? "unknown"}</span>
            {ctr && (
              <>
                <span style={{ color: "#d4d4d8" }}>·</span>
                <span>{ctr}% CTR</span>
              </>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
