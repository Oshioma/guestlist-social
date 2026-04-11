import Link from "next/link";
import { notFound } from "next/navigation";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { createClient } from "@/lib/supabase/server";
import AdForm from "@/app/admin-panel/components/AdForm";
import { createAdAction } from "@/app/admin-panel/lib/ad-actions";

type Props = {
  params: Promise<{ clientId: string; campaignId: string }>;
};

export default async function NewAdPage({ params }: Props) {
  const { clientId, campaignId } = await params;
  const supabase = await createClient();

  const [{ data: client, error: clientError }, { data: campaign, error: campaignError }] =
    await Promise.all([
      supabase.from("clients").select("id, name").eq("id", clientId).single(),
      supabase
        .from("campaigns")
        .select("id, name")
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
      await createAdAction(clientId, campaignId, formData);
      return { error: null };
    } catch (error) {
      if (isRedirectError(error)) throw error;

      return {
        error:
          error instanceof Error ? error.message : "Could not create ad.",
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
            New ad
          </h1>

          <p
            style={{
              margin: "10px 0 0",
              fontSize: 14,
              color: "#71717a",
              maxWidth: 720,
            }}
          >
            Add a new ad to{" "}
            <strong style={{ color: "#18181b" }}>{campaign.name}</strong> for{" "}
            <strong style={{ color: "#18181b" }}>{client.name}</strong>.
          </p>
        </div>
      </div>

      <AdForm
        title={`New ad for ${campaign.name}`}
        submitLabel="Create ad"
        action={action}
      />
    </div>
  );
}
