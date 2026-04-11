import { notFound } from "next/navigation";
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
      return {
        error: error instanceof Error ? error.message : "Could not update client.",
      };
    }
  }

  return (
    <ClientForm
      title={`Edit ${client.name}`}
      submitLabel="Save changes"
      action={action}
      initialValues={{
        name: client.name ?? "",
        platform: client.platform ?? "Meta",
        monthlyBudget: Number(client.monthly_budget ?? 0),
        status: mapClientStatus(client.status ?? "testing"),
      }}
    />
  );
}
