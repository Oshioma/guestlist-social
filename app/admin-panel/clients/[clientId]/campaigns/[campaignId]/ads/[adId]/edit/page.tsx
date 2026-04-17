import Link from "next/link";
import { notFound } from "next/navigation";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { createClient } from "@/lib/supabase/server";
import { requireAdsAccess } from "@/lib/auth/permissions";
import AdForm from "@/app/admin-panel/components/AdForm";
import ClientMemories from "@/app/admin-panel/components/ClientMemories";
import { updateAdAction } from "@/app/admin-panel/lib/ad-actions";

type Props = {
  params: Promise<{ clientId: string; campaignId: string; adId: string }>;
};

export default async function EditAdPage({ params }: Props) {
  await requireAdsAccess();
  const { clientId, campaignId, adId } = await params;
  const supabase = await createClient();

  const [
    { data: client, error: clientError },
    { data: ad, error: adError },
    { data: memoryRows },
  ] = await Promise.all([
    supabase.from("clients").select("name").eq("id", clientId).single(),
    supabase
      .from("ads")
      .select("*")
      .eq("id", adId)
      .eq("client_id", clientId)
      .eq("campaign_id", campaignId)
      .single(),
    supabase
      .from("memories")
      .select("id, note, tag")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false }),
  ]);

  if (clientError || !client || adError || !ad) {
    notFound();
  }

  const memories = (memoryRows ?? []).map((m) => ({
    id: String(m.id),
    note: String(m.note),
    tag: String(m.tag),
  }));

  async function action(
    _state: { error: string | null },
    formData: FormData
  ): Promise<{ error: string | null }> {
    "use server";

    try {
      await updateAdAction(clientId, campaignId, adId, formData);
      return { error: null };
    } catch (error) {
      if (isRedirectError(error)) throw error;

      return {
        error:
          error instanceof Error ? error.message : "Could not update ad.",
      };
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
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
            Edit ad
          </h1>

          <p
            style={{
              margin: "10px 0 0",
              fontSize: 14,
              color: "#71717a",
              maxWidth: 720,
            }}
          >
            Update details for{" "}
            <strong style={{ color: "#18181b" }}>{ad.name}</strong>
          </p>
        </div>
      </div>

      <ClientMemories memories={memories} clientName={client.name} />

      <AdForm
        title={`Edit ${ad.name}`}
        submitLabel="Save changes"
        action={action}
        initialValues={{
          name: ad.name ?? "",
          status: ad.status ?? "testing",
          spend: Number(ad.spend ?? 0),
          impressions: Number(ad.impressions ?? 0),
          clicks: Number(ad.clicks ?? 0),
          engagement: Number(ad.engagement ?? 0),
          conversions: Number(ad.conversions ?? 0),
          audience: ad.audience ?? "",
          creativeHook: ad.creative_hook ?? "",
          notes: ad.notes ?? "",
        }}
      />
    </div>
  );
}
