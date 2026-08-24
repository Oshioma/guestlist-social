import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { canRunAds } from "@/lib/auth/permissions";
import { mapDbAdToUiAd } from "@/app/admin-panel/lib/mappers";
import { persistImageToStorage } from "@/lib/persist-image";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createMetaAd } from "@/lib/meta-ad-create";
import { getCreativeSourcesForClient } from "@/lib/creative-sources";
import MetaAdForm from "@/app/admin-panel/components/MetaAdForm";
import DeleteCampaignButton from "@/app/admin-panel/components/DeleteCampaignButton";
import { generateSuggestionsFromLearnings } from "@/app/admin-panel/lib/learning-suggestions";
import { deleteCampaignNoRedirect } from "@/app/admin-panel/lib/campaign-actions";

import SectionCard from "@/app/admin-panel/components/SectionCard";
import StatCard from "@/app/admin-panel/components/StatCard";
import AdRow from "@/app/admin-panel/components/AdRow";
import AdQuickActions from "@/app/admin-panel/components/AdQuickActions";
import InlineBudgetEdit from "@/app/admin-panel/components/InlineBudgetEdit";
import EmptyState from "@/app/admin-panel/components/EmptyState";
import AdPreviewCard from "@/app/admin-panel/components/AdPreviewCard";
import CreateActionFromSuggestionButton from "@/app/admin-panel/components/CreateActionFromSuggestionButton";
import ClearCampaignDraft from "@/app/admin-panel/components/ClearCampaignDraft";
import { formatCurrency } from "@/app/admin-panel/lib/utils";

type Props = {
  params: Promise<{ clientId: string; campaignId: string }>;
  searchParams?: Promise<{ created?: string; adError?: string }>;
};

export const dynamic = "force-dynamic";
// The inline ad create runs Meta uploads inside this route's server action.
export const maxDuration = 90;

export default async function CampaignDetailPage({ params, searchParams }: Props) {
  try {
  const { clientId, campaignId } = await params;
  const query = await searchParams;
  const justCreated = query?.created === "1";
  // Set when the campaign saved but its first ad did not — see
  // createCampaignAction. The operator has to be told, or the copy they wrote
  // on the campaign form disappears without a word.
  const adFailure = query?.adError ?? null;
  const supabase = await createClient();
  const adsAllowed = await canRunAds();

  // The legacy `actions` table used to power a "Generated actions" section
  // here, but that surface has been replaced by the per-ad audit trail
  // (/app/clients/[clientId]/ads/[adId]) which reads ad_actions directly.
  const [
    { data: client, error: clientError },
    { data: campaign, error: campaignError },
    { data: adsRows, error: adsError },
    { data: learningRows, error: learningsError },
  ] = await Promise.all([
    supabase.from("clients").select("id, name, website_url, meta_ad_account_id").eq("id", clientId).single(),
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
      .from("learnings")
      .select("*")
      .eq("client_id", clientId)
      .eq("campaign_id", campaignId)
      .order("created_at", { ascending: false }),
  ]);

  if (
    clientError ||
    !client ||
    campaignError ||
    !campaign
  ) {
    notFound();
  }

  const ads = (adsRows ?? []).map(mapDbAdToUiAd);
  const rawAdById = new Map<string, any>();
  for (const row of adsRows ?? []) {
    rawAdById.set(String(row.id), row);
  }
  let creativeSources: Awaited<ReturnType<typeof getCreativeSourcesForClient>> = [];
  try {
    creativeSources = await getCreativeSourcesForClient(clientId);
  } catch (err) {
    console.error("campaign page: creative sources unavailable:", err);
  }

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

  let learningSuggestions: Awaited<ReturnType<typeof generateSuggestionsFromLearnings>> = [];
  try {
    learningSuggestions = await generateSuggestionsFromLearnings(clientId, campaignId);
  } catch (err) {
    // learnings table may not exist — degrade gracefully, but leave a trace
    console.error("campaign page: learning suggestions unavailable:", err);
  }

  const hasMetaId = !!(campaign as any).meta_id;
  const hasMetaAdsetId = !!(campaign as any).meta_adset_id;
  const hasNoAds = ads.length === 0;

  let adAccountId = (client as any).meta_ad_account_id || process.env.META_AD_ACCOUNT_ID || null;
  if (adAccountId && !adAccountId.startsWith("act_")) adAccountId = `act_${adAccountId}`;
  let adAccountName: string | null = null;
  if (adAccountId) {
    try {
      const token = process.env.META_ACCESS_TOKEN;
      if (token) {
        // Cosmetic label only — never let it hold up the page this redirect
        // lands on. A slow Meta here reads to the operator as a create that
        // never finishes.
        const res = await fetch(
          `https://graph.facebook.com/v25.0/${adAccountId}?fields=name&access_token=${token}`,
          { cache: "no-store", signal: AbortSignal.timeout(4000) }
        );
        if (res.ok) {
          const data = await res.json();
          adAccountName = data.name ?? null;
        }
      }
    } catch (err) {
      console.error("campaign page: Meta ad-account name lookup failed:", err);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Keep the draft when the ad half failed — it still holds that ad copy. */}
      {justCreated && !adFailure && <ClearCampaignDraft clientId={clientId} />}

      {adFailure && (
        <div
          style={{
            fontSize: 13,
            color: "#991b1b",
            background: "#fef2f2",
            border: "1px solid #fecaca",
            borderRadius: 10,
            padding: "12px 14px",
            lineHeight: 1.55,
          }}
        >
          <strong style={{ fontWeight: 700 }}>
            The campaign was created, but its first ad was not saved.
          </strong>
          <span style={{ display: "block", marginTop: 4 }}>{adFailure}</span>
          <span style={{ display: "block", marginTop: 6, color: "#7f1d1d" }}>
            Your ad copy is still saved on this device — reopen the new-campaign
            form to get it back, or add the ad below.
          </span>
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <Link
          href={`/app/clients/${clientId}`}
          style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 13, color: "#71717a", textDecoration: "none" }}
        >
          &larr; {client.name}
        </Link>
        <span style={{ color: "#d4d4d8" }}>/</span>
        <span style={{ fontSize: 14, fontWeight: 700, color: "#18181b" }}>{campaign.name}</span>
      </div>


      {justCreated && !adFailure && (
        <div
          style={{
            fontSize: 13,
            color: "#166534",
            background: "#ecfdf5",
            border: "1px solid #bbf7d0",
            borderRadius: 10,
            padding: "10px 14px",
          }}
        >
          <strong style={{ fontWeight: 700 }}>Campaign created.</strong>{" "}
          {hasNoAds
            ? "Add its first ad below whenever you're ready."
            : "Its first ad is below — it starts paused until you switch it on."}
        </div>
      )}

      {/* What was just created, first — the campaign itself. */}
      <div
        style={{
          background: "#fff",
          border: "1px solid #e4e4e7",
          borderRadius: 16,
          padding: "20px 22px",
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#18181b", lineHeight: 1.25 }}>
              {campaign.name}
            </h1>
            <div style={{ marginTop: 6, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <span
                style={{
                  ...statusStyle,
                  padding: "3px 10px",
                  borderRadius: 999,
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: "capitalize",
                }}
              >
                {campaignStatus}
              </span>
              <span style={{ fontSize: 12, color: "#71717a", textTransform: "capitalize" }}>
                {String((campaign as any).objective ?? "engagement")}
              </span>
              {Number((campaign as any).budget ?? 0) > 0 && (
                <span style={{ fontSize: 12, color: "#71717a" }}>
                  {formatCurrency(Number((campaign as any).budget))}/day
                </span>
              )}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <Link
              href={`/app/clients/${clientId}/campaigns/${campaignId}/edit`}
              style={{
                border: "1px solid #e4e4e7",
                borderRadius: 10,
                padding: "7px 14px",
                fontSize: 13,
                fontWeight: 600,
                color: "#18181b",
                textDecoration: "none",
                background: "#fff",
              }}
            >
              Edit campaign
            </Link>
            {hasMetaId && (
              <a
                href={`https://www.facebook.com/adsmanager/manage/ads?act=${((client as any).meta_ad_account_id ?? (campaign as any).meta_ad_account_name ?? process.env.META_AD_ACCOUNT_ID ?? "").replace("act_", "")}&selected_campaign_ids=${(campaign as any).meta_id}`}
                target="_blank"
                rel="noreferrer"
                style={{
                  border: "1px solid #c7d2fe",
                  background: "#eef2ff",
                  borderRadius: 10,
                  padding: "7px 14px",
                  fontSize: 13,
                  fontWeight: 600,
                  color: "#4338ca",
                  textDecoration: "none",
                }}
              >
                View in Meta
              </a>
            )}
          </div>
        </div>

        {(campaign as any).audience && (
          <div style={{ fontSize: 13, color: "#52525b", lineHeight: 1.5 }}>
            <span style={{ color: "#a1a1aa" }}>Audience: </span>
            {String((campaign as any).audience)}
          </div>
        )}

        {!hasNoAds && (
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 12, color: "#52525b" }}>
            <span style={{ fontWeight: 700, color: "#18181b", fontSize: 13 }}>
              {ads.length} ad{ads.length === 1 ? "" : "s"}
            </span>
            {totalSpend > 0 && <span>{formatCurrency(totalSpend)} spent</span>}
            {avgCtr > 0 && <span style={{ color: avgCtr >= 2 ? "#166534" : "#52525b" }}>{avgCtr}% CTR</span>}
            {ads.reduce((s, a) => s + a.conversions, 0) > 0 && (
              <span style={{ color: "#166534", fontWeight: 600 }}>
                {ads.reduce((s, a) => s + a.conversions, 0)} results
              </span>
            )}
          </div>
        )}
      </div>

      {/* Then the ads it contains — including the one just created. */}
      {hasNoAds ? (
        <EmptyState
          title="No ads in this campaign yet"
          description="Add the first one below. It starts paused so you can review it before it spends anything."
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#18181b" }}>
            Ads in this campaign
          </h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
              gap: 16,
            }}
          >
            {ads.map((ad) => {
              const raw = rawAdById.get(String(ad.id)) ?? {};
              return (
                <AdPreviewCard
                  key={ad.id}
                  adId={Number(ad.id)}
                  adName={ad.name}
                  imageUrl={raw.creative_image_url ?? null}
                  headline={raw.creative_headline ?? null}
                  body={raw.creative_body ?? null}
                  cta={raw.creative_cta ?? null}
                  destinationUrl={raw.creative_destination_url ?? null}
                  metaId={raw.meta_id ?? null}
                  adsetMetaId={(campaign as any).meta_adset_id ?? null}
                  status={String(raw.status ?? "testing")}
                />
              );
            })}
          </div>
        </div>
      )}

      {adsAllowed && (() => {
        async function inlineMetaAction(data: {
          name: string;
          imageUrl: string;
          headline: string;
          body: string;
          ctaType: string;
          destinationUrl: string;
        }): Promise<{ error?: string; warning?: string }> {
          "use server";
          const startedAt = Date.now();
          const adsetMetaId = (campaign as any).meta_adset_id as string | null;

          // Meta is handed the original URL either way, so copying the
          // creative into our storage is bookkeeping — and an unbounded
          // upload in front of the operator's click is exactly what made
          // "Creating ad in Meta…" hang. Save the original now, copy after.
          const persistedUrl = data.imageUrl;
          const imageMs = Date.now() - startedAt;

          // Push to Meta when the campaign has an ad set, but never let Meta
          // decide whether the operator keeps their ad: a refusal or a timeout
          // becomes a warning on an ad that is still saved here.
          let metaAdId: string | null = null;
          let metaWarning: string | null = null;
          const metaStart = Date.now();
          if (adsetMetaId) {
            try {
              const result = await createMetaAd({
                adsetMetaId,
                name: data.name,
                imageUrl: data.imageUrl,
                headline: data.headline,
                body: data.body,
                ctaType: data.ctaType,
                destinationUrl: data.destinationUrl,
              });
              if (result.ok) metaAdId = result.adId;
              else metaWarning = `Meta ${result.step}: ${result.error}`;
            } catch (err) {
              metaWarning =
                err instanceof Error ? err.message : "Meta did not respond in time.";
            }
          }
          const metaMs = Date.now() - metaStart;

          const supabaseInner = await createClient();
          const { error: adError } = await supabaseInner.from("ads").insert({
            client_id: clientId,
            campaign_id: campaignId,
            ...(metaAdId ? { meta_id: metaAdId } : {}),
            name: data.name,
            status: "testing",
            creative_image_url: persistedUrl,
            creative_headline: data.headline,
            creative_body: data.body,
            creative_cta: data.ctaType,
          });

          console.log(
            `inlineMetaAction: campaign ${campaignId} — image ${imageMs}ms, meta ${metaMs}ms, total ${
              Date.now() - startedAt
            }ms, metaAdId ${metaAdId ?? "none"}`
          );

          if (adError) {
            console.error("inlineMetaAction ads insert error:", adError);
            const detail = `${adError.message}${adError.code ? ` (${adError.code})` : ""}`;
            return {
              error: metaAdId
                ? `The ad was created in Meta but could not be saved here — ${detail}`
                : `Could not save the ad — ${detail}`,
            };
          }

          if (data.imageUrl) {
            after(async () => {
              try {
                const persisted = await persistImageToStorage(
                  data.imageUrl,
                  `ad-creatives/${clientId}`
                );
                if (persisted && persisted !== data.imageUrl) {
                  await createAdminClient()
                    .from("ads")
                    .update({ creative_image_url: persisted })
                    .eq("campaign_id", campaignId)
                    .eq("creative_image_url", data.imageUrl);
                }
              } catch (err) {
                console.error("Background creative persistence failed:", err);
              }
            });
          }

          revalidatePath(`/admin-panel/clients/${clientId}/campaigns/${campaignId}`);
          return metaWarning
            ? { warning: `Saved here, but not pushed to Meta — ${metaWarning}` }
            : {};
        }

        return (
          // Collapsed once the campaign has ads. Landing on a page whose first
          // element is an empty ad form reads as "my campaign wasn't created",
          // which is exactly how it felt.
          <details open={hasNoAds}>
            <summary
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                marginBottom: 12,
                flexWrap: "wrap",
                cursor: "pointer",
                listStyle: "none",
              }}
            >
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#18181b" }}>
                {hasNoAds ? "Add your first ad" : "+ Add another ad"}
              </h2>
              {adAccountId && (
                <span
                  style={{
                    padding: "3px 10px",
                    borderRadius: 999,
                    fontSize: 11,
                    fontWeight: 600,
                    background: "#eef2ff",
                    border: "1px solid #c7d2fe",
                    color: "#4338ca",
                  }}
                  title={adAccountId}
                >
                  {adAccountName ?? adAccountId}
                </span>
              )}
            </summary>
            <p style={{ margin: "0 0 16px", fontSize: 13, color: "#71717a" }}>
              Upload an image, write your copy, and create your ad. It starts paused so you can review first.
            </p>
            <MetaAdForm
              campaignName={campaign.name}
              clientId={clientId}
              clientWebsite={(client as any).website_url ?? ""}
              objective={(campaign as any).objective ?? "engagement"}
              existingCreatives={creativeSources}
              onSubmit={inlineMetaAction}
              draftKey={`ad-draft:${clientId}:${campaignId}`}
            />
          </details>
        );
      })()}
    </div>
  );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("CampaignDetailPage error:", message, err);
    const { clientId: cid } = await params;
    return (
      <div style={{ padding: 40 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: "#18181b" }}>
          Something went wrong loading this campaign
        </h2>
        <p style={{ fontSize: 13, color: "#991b1b", margin: "8px 0", background: "#fef2f2", padding: "8px 12px", borderRadius: 8, border: "1px solid #fecaca" }}>
          {message}
        </p>
        <Link
          href={`/app/clients/${cid}`}
          style={{ fontSize: 14, color: "#4338ca", textDecoration: "underline" }}
        >
          Back to client
        </Link>
      </div>
    );
  }
}

