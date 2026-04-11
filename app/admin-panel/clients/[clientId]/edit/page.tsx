import Link from "next/link";
import { notFound } from "next/navigation";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { createClient } from "../../../../../../../lib/supabase/server";
import CampaignForm from "../../../../../components/CampaignForm";
import { updateCampaignAction } from "../../../../../lib/campaign-actions";

type Props = {
  params: Promise<{ clientId: string; campaignId: string }>;
};

export default async function EditCampaignPage({ params }: Props) {
  const { clientId, campaignId } = await params;
  const supabase = await createClient();

  const [{ data: client, error: clientError }, { data: campaign, error: campaignError }] =
    await Promise.all([
      supabase.from("clients").select("id, name").eq("id", clientId).single(),
      supabase
        .from("campaigns")
        .select("*")
        .eq("id", campaignId)
        .eq("client_id", clientId)
        .single(),
    ]);

  if (clientError || !client || campaignError || !campaign) {
    notFound();
  }

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
            Update the campaign settings for{" "}
            <strong style={{ color: "#18181b" }}>{client.name}</strong>. Adjust
            objective, audience, budget, and status without losing campaign
            history.
          </p>
        </div>
      </div>

      <CampaignForm
        title={`Edit ${campaign.name}`}
        submitLabel="Save changes"
        action={action}
        initialValues={{
          name: campaign.name ?? "",
          objective: campaign.objective ?? "engagement",
          audience: campaign.audience ?? "",
          budget: Number(campaign.budget ?? 0),
          status:
            campaign.status === "draft" ||
            campaign.status === "testing" ||
            campaign.status === "live" ||
            campaign.status === "paused" ||
            campaign.status === "completed"
              ? campaign.status
              : "testing",
        }}
      />
    </div>
  );
}
