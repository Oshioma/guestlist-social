import Link from "next/link";
import { notFound } from "next/navigation";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { createClient } from "../../../../../lib/supabase/server";
import ClientForm from "../../../components/ClientForm";
import { updateClientAction } from "../../../lib/client-actions";
import { mapClientStatus } from "../../../lib/mappers";

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
            Edit client
          </h1>

          <p
            style={{
              margin: "10px 0 0",
              fontSize: 14,
              color: "#71717a",
              maxWidth: 700,
            }}
          >
            Update the core details for{" "}
            <strong style={{ color: "#18181b" }}>{client.name}</strong>,
            including platform, budget, status, website, and notes.
          </p>
        </div>
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
        }}
      />
    </div>
  );
}
