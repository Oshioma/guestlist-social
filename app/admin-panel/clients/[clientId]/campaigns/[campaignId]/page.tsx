import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  mapDbAdToUiAd,
  mapDbActionToUiAction,
} from "@/app/admin-panel/lib/mappers";
import { generateCampaignActions } from "@/app/admin-panel/lib/rule-actions";
import { generateSuggestionsFromLearnings } from "@/app/admin-panel/lib/learning-suggestions";
import { getAdTrends, type AdTrend } from "@/app/admin-panel/lib/snapshot-actions";
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

  // Step 1: Fetch client, campaign, and ads
  const [
    { data: client, error: clientError },
    { data: campaign, error: campaignError },
    { data: adsRows },
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

  if (clientError || !client || campaignError || !campaign) {
    console.error("Campaign page 404:", { clientError, campaignError, clientId, campaignId });
    notFound();
  }

  // Step 2: Auto-run rule engine so actions are always fresh
  try {
    await generateCampaignActions(clientId, campaignId);
  } catch (e) {
    console.error("Auto-generate actions on page load:", e);
  }

  // Step 3: Fetch actions, learnings, and trends (after rules have run)
  let adTrends: AdTrend[] = [];
  const [{ data: actionRows }, { data: learningRows }] = await Promise.all([
    supabase
      .from("actions")
      .select("*")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false }),
    supabase
      .from("learnings")
      .select("*")
      .eq("client_id", clientId)
      .eq("campaign_id", campaignId)
      .order("created_at", { ascending: false }),
  ]);

  try {
    adTrends = await getAdTrends(clientId, campaignId);
  } catch {
    // ad_snapshots table may not exist yet
  }

  const trendMap = new Map(adTrends.map((t) => [t.adId, t]));

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

  const campaignAdIds = new Set(ads.map((ad) => ad.id));

  const generatedActions = (actionRows ?? [])
    .filter((row) => {
      const title = String(row.title ?? "");
      if (!title.includes("[AUTO:")) return false;

      return [...campaignAdIds].some((adId) => title.includes(`:${adId}]`));
    })
    .map((row) => mapDbActionToUiAction(row, client.name));

  const openGeneratedActions = generatedActions.filter((action) => !action.done);
  const completedGeneratedActions = generatedActions.filter((action) => action.done);

  const learningSuggestions = await generateSuggestionsFromLearnings(
    clientId,
    campaignId
  );

  async function handleGenerateActions() {
    "use server";
    await generateCampaignActions(clientId, campaignId);
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
              <p
                style={{
                  margin: "6px 0 0",
                  fontSize: 12,
                  color: "#a1a1aa",
                }}
              >
                You can edit: objective, audience, budget, and status.
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
            value: avgCtr > 0 ? `${avgCtr}%` : "—",
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

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 20,
        }}
      >
        <SectionCard title={`Learnings (${(learningRows ?? []).length})`}>
          {(learningRows ?? []).length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {(learningRows ?? []).map((learning) => (
                <div
                  key={learning.id}
                  style={{
                    border: "1px solid #e4e4e7",
                    borderRadius: 14,
                    padding: 14,
                    background: "#fff",
                  }}
                >
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: "#18181b",
                      marginBottom: 6,
                    }}
                  >
                    {learning.problem || "Untitled learning"}
                  </div>

                  {learning.change_made ? (
                    <div
                      style={{
                        fontSize: 13,
                        color: "#52525b",
                        marginBottom: 6,
                      }}
                    >
                      <strong style={{ color: "#18181b" }}>Change:</strong>{" "}
                      {learning.change_made}
                    </div>
                  ) : null}

                  {learning.result ? (
                    <div
                      style={{
                        fontSize: 13,
                        color: "#52525b",
                        marginBottom: 6,
                      }}
                    >
                      <strong style={{ color: "#18181b" }}>Result:</strong>{" "}
                      {learning.result}
                    </div>
                  ) : null}

                  {learning.outcome ? (
                    <div
                      style={{
                        fontSize: 13,
                        color: "#71717a",
                      }}
                    >
                      <strong style={{ color: "#18181b" }}>Outcome:</strong>{" "}
                      {learning.outcome}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No learnings yet"
              description="Completed actions can be turned into campaign learnings."
            />
          )}
        </SectionCard>

        <SectionCard
          title={`Suggestions from past learnings (${learningSuggestions.length})`}
        >
          {learningSuggestions.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {learningSuggestions.map((suggestion, index) => (
                <div
                  key={`${suggestion.title}-${index}`}
                  style={{
                    border: "1px solid #e4e4e7",
                    borderRadius: 14,
                    padding: 14,
                    background: "#fafafa",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 12,
                      marginBottom: 6,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 600,
                        color: "#18181b",
                      }}
                    >
                      {suggestion.title}
                    </div>

                    <span
                      style={{
                        fontSize: 11,
                        padding: "4px 8px",
                        borderRadius: 999,
                        background:
                          suggestion.priority === "high"
                            ? "#fee2e2"
                            : suggestion.priority === "medium"
                              ? "#fef3c7"
                              : "#e0f2fe",
                        color:
                          suggestion.priority === "high"
                            ? "#991b1b"
                            : suggestion.priority === "medium"
                              ? "#92400e"
                              : "#075985",
                        textTransform: "capitalize",
                        fontWeight: 600,
                      }}
                    >
                      {suggestion.priority}
                    </span>
                  </div>

                  <div
                    style={{
                      fontSize: 13,
                      color: "#71717a",
                    }}
                  >
                    {suggestion.description}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No learning-based suggestions yet"
              description="As more learnings are saved, the system will start recommending proven fixes."
            />
          )}
        </SectionCard>
      </div>

      <SectionCard title={`Generated actions (${generatedActions.length})`}>
        <details
          style={{
            marginBottom: 16,
            border: "1px solid #e4e4e7",
            borderRadius: 12,
            background: "#f4f4f5",
          }}
        >
          <summary
            style={{
              padding: "10px 14px",
              fontSize: 13,
              fontWeight: 600,
              color: "#52525b",
              cursor: "pointer",
            }}
          >
            How actions are generated
          </summary>
          <div
            style={{
              padding: "0 14px 14px",
              fontSize: 13,
              color: "#52525b",
              lineHeight: 1.6,
            }}
          >
            <p style={{ margin: "0 0 8px" }}>
              Every time you create or edit an ad, the system evaluates it
              against a set of rules:
            </p>
            <ul
              style={{
                margin: 0,
                paddingLeft: 18,
                display: "flex",
                flexDirection: "column",
                gap: 4,
              }}
            >
              <li>
                <strong>Weak CTR</strong> — if spend &ge; 5 and CTR is between
                0% and 1%, a &ldquo;Review weak ad&rdquo; action is created
              </li>
              <li>
                <strong>Winner</strong> — if CTR &ge; 2.5% and spend &ge; 3, a
                &ldquo;Consider scaling&rdquo; action is created
              </li>
              <li>
                <strong>Underperforming</strong> — if spend &ge; 8 but clicks
                &le; 2, a &ldquo;Pause&rdquo; action is created
              </li>
              <li>
                <strong>No delivery</strong> — if spend and impressions are both
                0, a &ldquo;Check delivery/setup&rdquo; action is created
              </li>
              <li>
                <strong>CTR declining</strong> — if CTR dropped 30%+ over
                recent days and spend &ge; 5, a &ldquo;CTR declining&rdquo;
                action is created
              </li>
            </ul>
            <p style={{ margin: "8px 0 0", fontSize: 12, color: "#71717a" }}>
              Actions that no longer match their rule are automatically
              completed. If conditions return, the action reopens.
            </p>
          </div>
        </details>

        {generatedActions.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <h3
                style={{
                  margin: "0 0 10px",
                  fontSize: 14,
                  fontWeight: 600,
                  color: "#18181b",
                }}
              >
                Open
              </h3>
              {openGeneratedActions.length > 0 ? (
                <ActionList actions={openGeneratedActions} />
              ) : (
                <EmptyState
                  title="No open generated actions"
                  description="Either nothing has triggered yet, or they have all been completed."
                />
              )}
            </div>

            <div>
              <h3
                style={{
                  margin: "0 0 10px",
                  fontSize: 14,
                  fontWeight: 600,
                  color: "#18181b",
                }}
              >
                Completed
              </h3>
              {completedGeneratedActions.length > 0 ? (
                <ActionList actions={completedGeneratedActions} />
              ) : (
                <EmptyState
                  title="No completed generated actions"
                  description="Completed auto-actions will appear here."
                />
              )}
            </div>
          </div>
        ) : (
          <EmptyState
            title="No generated actions yet"
            description="Click Generate actions to evaluate the ads in this campaign."
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
        <p style={{ margin: "0 0 12px", fontSize: 12, color: "#a1a1aa" }}>
          Use the Edit button on each ad to update: name, status, spend,
          impressions, clicks, engagement, conversions, audience, creative hook,
          and notes.
        </p>
        {ads.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {ads.map((ad) => {
              const trend = trendMap.get(String(ad.id));
              return (
                <div key={ad.id}>
                  <AdRow ad={ad} />
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginTop: 8,
                      marginBottom: 12,
                    }}
                  >
                    {trend ? (
                      <span
                        style={{
                          fontSize: 12,
                          color:
                            trend.direction === "up"
                              ? "#16a34a"
                              : trend.direction === "down"
                                ? "#dc2626"
                                : "#71717a",
                          fontWeight: 500,
                        }}
                      >
                        {trend.direction === "up"
                          ? "\u25B2"
                          : trend.direction === "down"
                            ? "\u25BC"
                            : "\u2014"}{" "}
                        CTR {trend.ctrChange > 0 ? "+" : ""}
                        {trend.ctrChange}% over {trend.daysCompared}d
                        <span style={{ color: "#a1a1aa", fontWeight: 400 }}>
                          {" "}
                          ({trend.ctrBefore}% &rarr; {trend.ctrNow}%)
                        </span>
                      </span>
                    ) : (
                      <span style={{ fontSize: 12, color: "#a1a1aa" }}>
                        No trend data yet
                      </span>
                    )}
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
              );
            })}
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
