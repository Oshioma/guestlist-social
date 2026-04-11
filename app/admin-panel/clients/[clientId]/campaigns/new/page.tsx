import Link from "next/link";
import { notFound } from "next/navigation";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { createClient } from "../../../../../../lib/supabase/server";
import CampaignForm from "../../../../components/CampaignForm";
import { createCampaignAction } from "../../../../lib/campaign-actions";

type Props = {
  params: Promise<{ clientId: string }>;
};

export default async function NewCampaignPage({ params }: Props) {
  const { clientId } = await params;
  const supabase = await createClient();

  const { data: client, error } = await supabase
    .from("clients")
    .select("name")
    .eq("id", clientId)
    .single();

  if (error || !client) {
    notFound();
  }

  async function action(
    _state: { error: string | null },
    formData: FormData
  ): Promise<{ error: string | null }> {
    "use server";

    try {
      await createCampaignAction(clientId, formData);
      return { error: null };
    } catch (error) {
      if (isRedirectError(error)) throw error;

      return {
        error:
          error instanceof Error
            ? error.message
            : "Could not create campaign.",
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
            New campaign
          </h1>

          <p
            style={{
              margin: "10px 0 0",
              fontSize: 14,
              color: "#71717a",
              maxWidth: 700,
            }}
          >
            Create a new campaign for <strong style={{ color: "#18181b" }}>{client.name}</strong>.
            Start simple: objective, audience, budget, and status. You can add ads
            to the campaign after this.
          </p>
        </div>
      </div>

      <CampaignForm action={action} />
    </div>
  );
}
