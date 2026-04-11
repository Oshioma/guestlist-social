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
        error: error instanceof Error ? error.message : "Could not create campaign.",
      };
    }
  }

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <Link
          href={`/app/clients/${clientId}`}
          style={{ fontSize: 13, color: "#71717a", textDecoration: "none" }}
        >
          &larr; Back to {client.name}
        </Link>
      </div>

      <CampaignForm action={action} />
    </div>
  );
}
