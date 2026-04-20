import Link from "next/link";
import { notFound } from "next/navigation";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { createClient } from "../../../../../lib/supabase/server";
import ClientForm from "../../../components/ClientForm";
import ClientAiInstructions from "../../../components/ClientAiInstructions";
import ClientBrandContext from "../../../components/ClientBrandContext";
import { updateClientAction } from "../../../lib/client-actions";
import { mapClientStatus } from "../../../lib/mappers";
import type { BrandContext } from "../../../lib/types";

type Props = {
  params: Promise<{ clientId: string }>;
};

export default async function EditClientPage({ params }: Props) {
  const { clientId } = await params;
  const supabase = await createClient();

  const { data: client, error } = await supabase
    .from("clients")
    .select("*")
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
      await updateClientAction(clientId, formData);
      return { error: null };
    } catch (error) {
      if (isRedirectError(error)) throw error;

      return {
        error:
          error instanceof Error
            ? error.message
            : "Could not update client.",
      };
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Link
            href={`/app/clients/${clientId}`}
            style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 13, color: "#71717a", textDecoration: "none" }}
          >
            &larr; {client.name}
          </Link>
          <span style={{ color: "#d4d4d8" }}>/</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: "#18181b" }}>Edit</span>
        </div>
        <Link
          href={`/app/clients/${clientId}`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            padding: "8px 14px",
            borderRadius: 10,
            background: "#18181b",
            color: "#fff",
            textDecoration: "none",
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          View client
        </Link>
      </div>

      <ClientForm
        title={`Edit ${client.name}`}
        submitLabel="Save changes"
        action={action}
        initialValues={{
          name: client.name ?? "",
          platform: client.platform ?? "Meta",
          monthlyBudget: Number(client.monthly_budget ?? 0),
          status: mapClientStatus(client.status ?? "testing"),
          websiteUrl: client.website_url ?? "",
          notes: client.notes ?? "",
          industry: client.industry ?? "",
          metaAdAccountId: client.meta_ad_account_id ?? "",
        }}
      />

      <ClientAiInstructions
        clientId={clientId}
        initialInstructions={client.ai_instructions ?? ""}
      />

      <ClientBrandContext
        clientId={clientId}
        initialContext={{
          toneOfVoice: (client.brand_context as BrandContext | null)?.toneOfVoice ?? "",
          targetAudience: (client.brand_context as BrandContext | null)?.targetAudience ?? "",
          offers: (client.brand_context as BrandContext | null)?.offers ?? "",
          bannedWords: (client.brand_context as BrandContext | null)?.bannedWords ?? "",
          ctaStyle: (client.brand_context as BrandContext | null)?.ctaStyle ?? "",
          visualStyle: (client.brand_context as BrandContext | null)?.visualStyle ?? "",
          hashtagsPolicy: (client.brand_context as BrandContext | null)?.hashtagsPolicy ?? "",
          platformRules: (client.brand_context as BrandContext | null)?.platformRules ?? "",
        }}
      />
    </div>
  );
}
