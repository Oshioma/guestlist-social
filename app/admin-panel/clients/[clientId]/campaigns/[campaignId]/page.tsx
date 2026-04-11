import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { mapDbAdToUiAd, mapDbActionToUiAction } from "@/app/admin-panel/lib/mappers";
import { generateCampaignActions } from "@/app/admin-panel/lib/rule-actions";
import { createLearningFromAction } from "@/app/admin-panel/lib/learning-actions";
import SectionCard from "@/app/admin-panel/components/SectionCard";
import StatCard from "@/app/admin-panel/components/StatCard";
import AdRow from "@/app/admin-panel/components/AdRow";
import EmptyState from "@/app/admin-panel/components/EmptyState";
import ActionList from "@/app/admin-panel/components/ActionList";
import GenerateActionsButton from "@/app/admin-panel/components/GenerateActionsButton";
import { formatCurrency } from "@/app/admin-panel/lib/utils";

type Props = {
  params: Promise<{ clientId: string; campaignId: string }>;
};

export const dynamic = "force-dynamic";

export default async function CampaignDetailPage({ params }: Props) {
  const { clientId, campaignId } = await params;
  const supabase = await createClient();

  const [
    { data: client, error: clientError },
    { data: campaign, error: campaignError },
    { data: adsRows, error: adsError },
    { data: actionRows, error: actionsError },
    { data: learningRows },
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
    supabase
      .from("actions")
      .select("*")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false }),
    supabase
      .from("learnings")
      .select("*")
      .eq("campaign_id", campaignId)
      .order("created_at", { ascending: false }),
  ]);

  if (clientError || !client || campaignError || !campaign || adsError || actionsError) {
    notFound();
  }

  const learnings = learningRows ?? [];

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

  // Filter actions that belong to this campaign's ads via [AUTO:rule:adId] signatures
  const campaignAdIds = new Set(ads.map((ad) => ad.id));

  const generatedActions = (actionRows ?? [])
    .filter((row) => {
      const title = String(row.title ?? "");
      if (!title.includes("[AUTO:")) return false;
      return [...campaignAdIds].some((adId) => title.includes(`:${adId}]`));
    })
    .map((row) => mapDbActionToUiAction(row, client.name));

  // Split into three status groups
  const openActions = generatedActions.filter((a) => a.status === "open");
  const inProgressActions = generatedActions.filter((a) => a.status === "in_progress");
  const completedActions = generatedActions.filter((a) => a.status === "completed");

  async function handleGenerateActions() {
    "use server";
    await generateCampaignActions(clientId, campaignId);
  }

  async function handleCreateLearning(actionId: string, formData: FormData) {
    "use server";
    // Extract adId from the action title signature [AUTO:rule:adId]
    const action = (actionRows ?? []).find((r) => r.id === actionId);
    const title = String(action?.title ?? "");
    const match = title.match(/\[AUTO:\w[\w-]*:([^\]]+)\]/);
    const adId = match ? match[1] : null;

    await createLearningFromAction(clientId, campaignId, adId, actionId, formData);
  }

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

            <div
              style={{
                display: "flex",
                gap: 8,
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
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

              <GenerateActionsButton action={handleGenerateActions} />
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

      {/* Generated Actions — three status groups */}
      <SectionCard title={`Generated actions (${generatedActions.length})`}>
        {generatedActions.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {/* Open */}
            {openActions.length > 0 && (
              <div>
                <h3
                  style={{
                    margin: "0 0 10px",
                    fontSize: 14,
                    fontWeight: 600,
                    color: "#b91c1c",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <span
                    style={{
                      display: "inline-block",
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: "#ef4444",
                    }}
                  />
                  Open ({openActions.length})
                </h3>
                <ActionList actions={openActions} onCreateLearning={handleCreateLearning} />
              </div>
            )}

            {/* In progress */}
            {inProgressActions.length > 0 && (
              <div>
                <h3
                  style={{
                    margin: "0 0 10px",
                    fontSize: 14,
                    fontWeight: 600,
                    color: "#92400e",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <span
                    style={{
                      display: "inline-block",
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: "#eab308",
                    }}
                  />
                  In progress ({inProgressActions.length})
                </h3>
                <ActionList actions={inProgressActions} onCreateLearning={handleCreateLearning} />
              </div>
            )}

            {/* Completed */}
            {completedActions.length > 0 && (
              <div>
                <h3
                  style={{
                    margin: "0 0 10px",
                    fontSize: 14,
                    fontWeight: 600,
                    color: "#166534",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <span
                    style={{
                      display: "inline-block",
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: "#22c55e",
                    }}
                  />
                  Completed ({completedActions.length})
                </h3>
                <ActionList actions={completedActions} onCreateLearning={handleCreateLearning} />
              </div>
            )}

            {/* Empty fallback */}
            {openActions.length === 0 &&
              inProgressActions.length === 0 &&
              completedActions.length === 0 && (
                <EmptyState
                  title="No generated actions"
                  description="Actions will appear here when rules detect issues with ads."
                />
              )}
          </div>
        ) : (
          <EmptyState
            title="No generated actions yet"
            description="Click Generate actions to evaluate the ads in this campaign."
          />
        )}
      </SectionCard>

      {/* Learnings */}
      <SectionCard title={`Learnings (${learnings.length})`}>
        {learnings.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {learnings.map((l: { id: string; problem: string; change_made: string; result: string; outcome: string }) => (
              <div
                key={l.id}
                style={{
                  border: "1px solid #e4e4e7",
                  borderRadius: 10,
                  padding: 12,
                  background: "#fff",
                }}
              >
                <div style={{ fontSize: 14, fontWeight: 600, color: "#18181b" }}>
                  {l.problem}
                </div>
                <div style={{ fontSize: 13, color: "#52525b", marginTop: 4 }}>
                  {l.change_made}
                </div>
                {l.result && (
                  <div style={{ fontSize: 13, color: "#166534", marginTop: 4 }}>
                    {l.result}
                  </div>
                )}
                {l.outcome && (
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: "#71717a",
                      marginTop: 6,
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                    }}
                  >
                    {l.outcome}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No learnings yet"
            description="Completed actions can be turned into learnings."
          />
        )}
      </SectionCard>

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
