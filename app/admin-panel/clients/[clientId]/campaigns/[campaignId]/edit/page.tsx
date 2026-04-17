import Link from "next/link";
import { notFound } from "next/navigation";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { createClient } from "@/lib/supabase/server";
import { requireAdsAccess } from "@/lib/auth/permissions";
import CampaignForm from "@/app/admin-panel/components/CampaignForm";
import ClientMemories from "@/app/admin-panel/components/ClientMemories";
import { updateCampaignAction } from "@/app/admin-panel/lib/campaign-actions";

type Props = {
  params: Promise<{ clientId: string; campaignId: string }>;
};

export default async function EditCampaignPage({ params }: Props) {
  await requireAdsAccess();
  const { clientId, campaignId } = await params;
  const supabase = await createClient();

  const [
    { data: client, error: clientError },
    { data: campaign, error: campaignError },
    { data: memoryRows },
  ] = await Promise.all([
    supabase.from("clients").select("name").eq("id", clientId).single(),
    supabase
      .from("campaigns")
      .select("*")
      .eq("id", campaignId)
      .eq("client_id", clientId)
      .single(),
    supabase
      .from("memories")
      .select("id, note, tag")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false }),
  ]);

  if (clientError || !client || campaignError || !campaign) {
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
      await updateCampaignAction(clientId, campaignId, formData);
      return { error: null };
    } catch (error) {
      if (isRedirectError(error)) throw error;

      return {
        error:
          error instanceof Error
            ? error.message
            : "Could not update campaign.",
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
            Edit campaign
          </h1>

          <p
            style={{
              margin: "10px 0 0",
              fontSize: 14,
              color: "#71717a",
              maxWidth: 700,
            }}
          >
            Update details for{" "}
            <strong style={{ color: "#18181b" }}>{campaign.name}</strong>
          </p>
        </div>
      </div>

      <ClientMemories memories={memories} clientName={client.name} />

      <CampaignForm
        title={`Edit ${campaign.name}`}
        submitLabel="Save changes"
        action={action}
        initialValues={{
          name: campaign.name ?? "",
          objective: campaign.objective ?? "engagement",
          budget: Number(campaign.budget ?? 0),
          audience: campaign.audience ?? "",
          status: campaign.status ?? "testing",
        }}
      />
    </div>
  );
}
