import { isRedirectError } from "next/dist/client/components/redirect-error";
import ClientForm from "../../components/ClientForm";
import { createClientAction } from "../../lib/client-actions";

async function action(
  _state: { error: string | null },
  formData: FormData
): Promise<{ error: string | null }> {
  "use server";

  try {
    await createClientAction(formData);
    return { error: null };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    return {
      error: error instanceof Error ? error.message : "Could not create client.",
    };
  }
}

export default function NewClientPage() {
  return (
    <ClientForm
      title="Add Client"
      submitLabel="Create client"
      action={action}
    />
  );
}
