import { isRedirectError } from "next/dist/client/components/redirect-error";
import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import ClientForm from "../../../../admin-panel/components/ClientForm";
import { updateClientAction } from "../../../../admin-panel/lib/client-actions";
import { mapClientStatus } from "../../../../admin-panel/lib/mappers";
import EmptyState from "../../../../admin-panel/components/EmptyState";
import ProoferNav from "../../../ProoferNav";
import { resolveNavData } from "../../../navData";

export const dynamic = "force-dynamic";

const mainStyle: React.CSSProperties = { flex: 1, minWidth: 0, padding: 24 };
const centerStyle: React.CSSProperties = { maxWidth: 900, margin: "0 auto", width: "100%" };

export default async function ProoferEditClientPage({
  params,
  searchParams,
}: {
  params: Promise<{ clientId: string }>;
  searchParams: Promise<{ client?: string; month?: string }>;
}) {
  const { clientId } = await params;
  const sp = await searchParams;
  const nav = await resolveNavData(sp.client, sp.month);

  const supabase = await createClient();
  const { data: client } = await supabase
    .from("clients")
    .select(
      "id, name, platform, monthly_budget, status, website_url, ig_handle, fb_page, notes, industry, meta_ad_account_id"
    )
    .eq("id", clientId)
    .maybeSingle();

  async function action(
    _state: { error: string | null },
    formData: FormData
  ): Promise<{ error: string | null }> {
    "use server";
    try {
      await updateClientAction(clientId, formData);
      return { error: null };
    } catch (error) {
      // updateClientAction redirects to the admin client page on success — the
      // save already happened, so send them back to the standalone list.
      if (isRedirectError(error)) redirect("/proofer/clients");
      return {
        error: error instanceof Error ? error.message : "Could not save client.",
      };
    }
  }

  return (
    <>
      <ProoferNav
        clients={nav.clients}
        clientId={nav.clientId}
        month={nav.month}
        pillars={nav.pillars}
        posts={nav.posts}
      />
      <main style={mainStyle}>
        <div style={centerStyle}>
          <Link
            href="/proofer/clients"
            style={{ fontSize: 13, fontWeight: 600, color: "#52525b", textDecoration: "none" }}
          >
            ← All clients
          </Link>
          <div style={{ height: 12 }} />
          {client ? (
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
                igHandle: client.ig_handle ?? "",
                fbPage: client.fb_page ?? "",
                notes: client.notes ?? "",
                industry: client.industry ?? "",
                metaAdAccountId: client.meta_ad_account_id ?? "",
              }}
            />
          ) : (
            <EmptyState title="Client not found" description="This client no longer exists." />
          )}
        </div>
      </main>
    </>
  );
}
