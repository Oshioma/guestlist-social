import Link from "next/link";
import { notFound } from "next/navigation";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { createClient } from "@/lib/supabase/server";
import { requireAdsAccess } from "@/lib/auth/permissions";
import AdForm from "@/app/admin-panel/components/AdForm";
import MetaAdForm from "@/app/admin-panel/components/MetaAdForm";
import ClientMemories from "@/app/admin-panel/components/ClientMemories";
import { createAdAction } from "@/app/admin-panel/lib/ad-actions";
import { createMetaAd } from "@/lib/meta-ad-create";
import { getCreativeSourcesForClient } from "@/lib/creative-sources";
import { revalidatePath } from "next/cache";

type Props = {
  params: Promise<{ clientId: string; campaignId: string }>;
};

export default async function NewAdPage({ params }: Props) {
  await requireAdsAccess();
  const { clientId, campaignId } = await params;
  const supabase = await createClient();

  const [
    { data: client, error: clientError },
    { data: campaign, error: campaignError },
    { data: memoryRows },
    creativeSources,
  ] = await Promise.all([
    supabase.from("clients").select("id, name").eq("id", clientId).single(),
    supabase
      .from("campaigns")
      .select("id, name, objective, meta_id, meta_adset_id")
      .eq("id", campaignId)
      .eq("client_id", clientId)
      .single(),
    supabase
      .from("memories")
      .select("id, note, tag")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false }),
    getCreativeSourcesForClient(clientId),
  ]);

  if (clientError || !client || campaignError || !campaign) {
    notFound();
  }

  const memories = (memoryRows ?? []).map((m) => ({
    id: String(m.id),
    note: String(m.note),
    tag: String(m.tag),
  }));

  const hasMetaAdSet = !!(campaign as any).meta_adset_id;

  async function localAction(
    _state: { error: string | null },
    formData: FormData
  ): Promise<{ error: string | null }> {
    "use server";
    try {
      await createAdAction(clientId, campaignId, formData);
      return { error: null };
    } catch (error) {
      if (isRedirectError(error)) throw error;
      return {
        error: error instanceof Error ? error.message : "Could not create ad.",
      };
    }
  }

  async function metaAction(data: {
    name: string;
    imageUrl: string;
    headline: string;
    body: string;
    ctaType: string;
    destinationUrl: string;
  }): Promise<{ error?: string }> {
    "use server";

    const adsetMetaId = (campaign as any).meta_adset_id as string;

    const result = await createMetaAd({
      adsetMetaId,
      name: data.name,
      imageUrl: data.imageUrl,
      headline: data.headline,
      body: data.body,
      ctaType: data.ctaType,
      destinationUrl: data.destinationUrl,
    });

    if (!result.ok) {
      return { error: `Meta ${result.step}: ${result.error}` };
    }

    const supabaseServer = await createClient();
    await supabaseServer.from("ads").insert({
      client_id: clientId,
      campaign_id: campaignId,
      meta_id: result.adId,
      name: data.name,
      status: "testing",
      creative_image_url: data.imageUrl,
      creative_headline: data.headline,
      creative_body: data.body,
      creative_cta: data.ctaType,
    });

    revalidatePath(`/admin-panel/clients/${clientId}/campaigns/${campaignId}`);
    revalidatePath(`/admin-panel/clients/${clientId}/ads`);
    return {};
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <Link
          href={`/app/clients/${clientId}/campaigns/${campaignId}`}
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
          &larr; Back to {campaign.name}
        </Link>

        <div
          style={{
            background: "#fff",
            border: "1px solid #e4e4e7",
            borderRadius: 16,
            padding: 20,
          }}
        >
          <h1
            style={{
              margin: 0,
              fontSize: 28,
              lineHeight: 1.05,
              fontWeight: 700,
              color: "#18181b",
              letterSpacing: "-0.02em",
            }}
          >
            Add ad to {campaign.name}
          </h1>

          <p
            style={{
              margin: "10px 0 0",
              fontSize: 14,
              color: "#71717a",
              maxWidth: 720,
            }}
          >
            {hasMetaAdSet
              ? "Upload a creative, write your copy, and this ad will be created directly in Meta Ads Manager. It starts paused so you can review before going live."
              : `Add an ad to ${campaign.name} for ${client.name}. This campaign doesn't have a Meta ad set — the ad will be saved locally only.`}
          </p>
        </div>
      </div>

      <ClientMemories memories={memories} clientName={client.name} />

      {hasMetaAdSet ? (
        <MetaAdForm
          campaignName={campaign.name}
          clientId={clientId}
          objective={(campaign as any).objective ?? "engagement"}
          existingCreatives={creativeSources}
          onSubmit={metaAction}
        />
      ) : (
        <AdForm
          title={`New ad for ${campaign.name}`}
          submitLabel="Create ad"
          action={localAction}
        />
      )}
    </div>
  );
}
