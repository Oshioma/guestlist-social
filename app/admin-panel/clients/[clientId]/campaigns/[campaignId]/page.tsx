import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { mapDbAdToUiAd } from "@/app/admin-panel/lib/mappers";
import SectionCard from "@/app/admin-panel/components/SectionCard";
import StatCard from "@/app/admin-panel/components/StatCard";
import AdRow from "@/app/admin-panel/components/AdRow";
import EmptyState from "@/app/admin-panel/components/EmptyState";
import { formatCurrency } from "@/app/admin-panel/lib/utils";

type Props = {
  params: Promise<{ clientId: string; campaignId: string }>;
};

export const dynamic = "force-dynamic";

async function autoCreateActions(
  supabase: Awaited<ReturnType<typeof createClient>>,
  clientId: string,
  adsRows: any[]
) {
  for (const ad of adsRows) {
    const impressions = Number(ad.impressions ?? 0);
    const clicks = Number(ad.clicks ?? 0);
    const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
    const status = String(ad.status ?? "testing");

    let title: string | null = null;
    let priority: "low" | "medium" | "high" = "medium";
    let kind: "pause" | "scale" | "creative" | "review" = "review";

    if (status === "winner" || (ctr >= 2.5 && impressions >= 1000)) {
      title = `Scale "${ad.name}" — CTR ${ctr.toFixed(1)}%, strong performer`;
      priority = "high";
      kind = "scale";
    } else if (status === "losing" || (ctr < 1.0 && impressions >= 1000)) {
      title = `Pause or refresh "${ad.name}" — CTR ${ctr.toFixed(1)}%, underperforming`;
      priority = "high";
      kind = "pause";
    } else if (status === "paused") {
      title = `Review paused ad "${ad.name}" — decide whether to restart or archive`;
      priority = "low";
      kind = "review";
    }

    if (!title) continue;

    const { data: existing } = await supabase
      .from("actions")
      .select("id")
      .eq("client_id", clientId)
      .ilike("title", `%${ad.name}%`)
      .eq("is_complete", false)
      .limit(1);

    if (existing && existing.length > 0) continue;

    await supabase.from("actions").insert({
      client_id: clientId,
      title,
      priority,
      kind,
      is_complete: false,
    });
  }
}

export default async function CampaignDetailPage({ params }: Props) {
  const { clientId, campaignId } = await params;
  const supabase = await createClient();

  const [
    { data: client, error: clientError },
    { data: campaign, error: campaignError },
    { data: adsRows, error: adsError },
  ] = await Promise.all([
    supabase.from("clients").select("id, name").eq("id", clientId).single(),
    supabase
      .from("campaigns")
      .select("*")
      .eq("id", campaignId)
      .eq("client_id", clientId)
      .single(),
    supabase
      .from("ads")
      .select("*")
      .eq("client_id", clientId)
      .eq("campaign_id", campaignId)
      .order("created_at", { ascending: false }),
  ]);

  if (clientError || !client || campaignError || !campaign || adsError) {
    notFound();
  }

  // Auto-create actions for strong/weak ads
  await autoCreateActions(supabase, clientId, adsRows ?? []);

  const ads = (adsRows ?? []).map(mapDbAdToUiAd);

  const winners = ads.filter((ad) => ad.status === "active" && ad.ctr >= 2.5);
  const paused = ads.filter((ad) => ad.status === "paused");
  const drafts = ads.filter((ad) => ad.status === "draft");
  const ended = ads.filter((ad) => ad.status === "ended");

  const totalSpend = ads.reduce((sum, ad) => sum + ad.spend, 0);
  const totalImpressions = ads.reduce((sum, ad) => sum + ad.impressions, 0);
  const totalClicks = ads.reduce((sum, ad) => sum + ad.clicks, 0);
  const avgCtr =
    totalImpressions > 0
      ? Number(((totalClicks / totalImpressions) * 100).toFixed(1))
      : 0;

  const campaignStatus =
    campaign.status === "draft" ||
    campaign.status === "testing" ||
    campaign.status === "live" ||
    campaign.status === "paused" ||
    campaign.status === "completed"
      ? campaign.status
      : "testing";

  const statusStyle =
    campaignStatus === "live"
      ? { background: "#dcfce7", color: "#166534" }
      : campaignStatus === "paused"
      ? { background: "#fef2f2", color: "#b91c1c" }
      : campaignStatus === "completed"
      ? { background: "#e4e4e7", color: "#3f3f46" }
      : campaignStatus === "draft"
      ? { background: "#f4f4f5", color: "#52525b" }
      : { background: "#fef3c7", color: "#92400e" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div>
        <Link
          href={`/app/clients/${clientId}`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 13,
            color: "#71717a",
            textDecoration: "none",
            marginBottom: 14,
          }}
        >
          &larr; Back to {client.name}
        </Link>

        <div
          style={{
            background: "#fff",
            border: "1px solid #e4e4e7",
            borderRadius: 18,
            padding: 22,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 16,
              alignItems: "flex-start",
              flexWrap: "wrap",
            }}
          >
            <div>
              <h1
                style={{
                  margin: 0,
                  fontSize: 30,
                  lineHeight: 1.05,
                  fontWeight: 700,
                  color: "#18181b",
                  letterSpacing: "-0.03em",
                }}
              >
                {campaign.name}
              </h1>

              <p
                style={{
                  margin: "10px 0 0",
                  fontSize: 14,
                  color: "#71717a",
                  maxWidth: 760,
                }}
              >
                {campaign.objective ?? "No objective"} ·{" "}
                {campaign.audience ?? "No audience set"}
              </p>
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  padding: "8px 12px",
                  borderRadius: 999,
                  fontSize: 12,
                  fontWeight: 600,
                  textTransform: "capitalize",
                  ...statusStyle,
                }}
              >
                {campaignStatus}
              </span>

              <Link
                href={`/app/clients/${clientId}/campaigns/${campaignId}/edit`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  padding: "8px 12px",
                  borderRadius: 10,
                  background: "#18181b",
                  color: "#fff",
                  textDecoration: "none",
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                Edit campaign
              </Link>

              <Link
                href={`/app/clients/${clientId}/campaigns/${campaignId}/ads/new`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  padding: "8px 12px",
                  borderRadius: 10,
                  border: "1px solid #e4e4e7",
                  background: "#fff",
                  color: "#18181b",
                  textDecoration: "none",
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                Add ad
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 16,
        }}
      >
        <StatCard
          stat={{
            label: "Budget",
            value: formatCurrency(Number(campaign.budget ?? 0)),
          }}
        />
        <StatCard
          stat={{
            label: "Spend",
            value: formatCurrency(totalSpend),
          }}
        />
        <StatCard
          stat={{
            label: "Ads",
            value: String(ads.length),
            change: `${winners.length} winners`,
            trend: winners.length > 0 ? "up" : "flat",
          }}
        />
        <StatCard
          stat={{
            label: "CTR",
            value: avgCtr > 0 ? `${avgCtr}%` : "\u2014",
            change: `${totalClicks} clicks`,
            trend: avgCtr >= 2.5 ? "up" : avgCtr > 0 ? "flat" : "down",
          }}
        />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.15fr 0.85fr",
          gap: 20,
        }}
      >
        <SectionCard title="Campaign summary">
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div
              style={{
                border: "1px solid #e4e4e7",
                borderRadius: 14,
                padding: 14,
                background: "#fafafa",
              }}
            >
              <p style={{ margin: "0 0 6px", fontSize: 14, fontWeight: 600 }}>
                Audience
              </p>
              <p style={{ margin: 0, fontSize: 14, color: "#52525b" }}>
                {campaign.audience ?? "No audience set"}
              </p>
            </div>

            <div
              style={{
                border: "1px solid #e4e4e7",
                borderRadius: 14,
                padding: 14,
                background: "#fafafa",
              }}
            >
              <p style={{ margin: "0 0 6px", fontSize: 14, fontWeight: 600 }}>
                Objective
              </p>
              <p style={{ margin: 0, fontSize: 14, color: "#52525b" }}>
                {campaign.objective ?? "No objective set"}
              </p>
            </div>

            {campaign.notes ? (
              <div
                style={{
                  border: "1px solid #e4e4e7",
                  borderRadius: 14,
                  padding: 14,
                  background: "#fafafa",
                }}
              >
                <p style={{ margin: "0 0 6px", fontSize: 14, fontWeight: 600 }}>
                  Notes
                </p>
                <p
                  style={{
                    margin: 0,
                    fontSize: 14,
                    color: "#52525b",
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {campaign.notes}
                </p>
              </div>
            ) : null}
          </div>
        </SectionCard>

        <SectionCard title="Signals">
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div
              style={{
                border: "1px solid #e4e4e7",
                borderRadius: 12,
                padding: 12,
                background: "#fff",
              }}
            >
              <div style={{ fontSize: 12, color: "#71717a" }}>Winners</div>
              <div style={{ marginTop: 4, fontSize: 18, fontWeight: 700 }}>
                {winners.length}
              </div>
            </div>

            <div
              style={{
                border: "1px solid #e4e4e7",
                borderRadius: 12,
                padding: 12,
                background: "#fff",
              }}
            >
              <div style={{ fontSize: 12, color: "#71717a" }}>Testing</div>
              <div style={{ marginTop: 4, fontSize: 18, fontWeight: 700 }}>
                {drafts.length}
              </div>
            </div>

            <div
              style={{
                border: "1px solid #e4e4e7",
                borderRadius: 12,
                padding: 12,
                background: "#fff",
              }}
            >
              <div style={{ fontSize: 12, color: "#71717a" }}>Paused</div>
              <div style={{ marginTop: 4, fontSize: 18, fontWeight: 700 }}>
                {paused.length}
              </div>
            </div>

            <div
              style={{
                border: "1px solid #e4e4e7",
                borderRadius: 12,
                padding: 12,
                background: "#fff",
              }}
            >
              <div style={{ fontSize: 12, color: "#71717a" }}>Ended</div>
              <div style={{ marginTop: 4, fontSize: 18, fontWeight: 700 }}>
                {ended.length}
              </div>
            </div>
          </div>
        </SectionCard>
      </div>

      <SectionCard
        title={`Ads in this campaign (${ads.length})`}
        action={
          <Link
            href={`/app/clients/${clientId}/campaigns/${campaignId}/ads/new`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              padding: "8px 12px",
              borderRadius: 10,
              background: "#18181b",
              color: "#fff",
              textDecoration: "none",
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            Add ad
          </Link>
        }
      >
        {ads.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {ads.map((ad) => (
              <div key={ad.id}>
                <AdRow ad={ad} />
                <div
                  style={{
                    display: "flex",
                    justifyContent: "flex-end",
                    marginTop: 8,
                    marginBottom: 12,
                  }}
                >
                  <Link
                    href={`/app/clients/${clientId}/campaigns/${campaignId}/ads/${ad.id}/edit`}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      padding: "7px 11px",
                      borderRadius: 9,
                      border: "1px solid #e4e4e7",
                      background: "#fff",
                      color: "#18181b",
                      textDecoration: "none",
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    Edit ad
                  </Link>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No ads in this campaign yet"
            description="Create the first ad to start tracking results inside this campaign."
          />
        )}
      </SectionCard>
    </div>
  );
}
