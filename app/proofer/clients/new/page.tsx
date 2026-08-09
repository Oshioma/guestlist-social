import { isRedirectError } from "next/dist/client/components/redirect-error";
import { redirect } from "next/navigation";
import ClientForm from "../../../admin-panel/components/ClientForm";
import { createClientAction } from "../../../admin-panel/lib/client-actions";
import ProoferNav from "../../ProoferNav";
import { resolveNavData } from "../../navData";

export const dynamic = "force-dynamic";

const mainStyle: React.CSSProperties = { flex: 1, minWidth: 0, padding: 24 };
const centerStyle: React.CSSProperties = { maxWidth: 900, margin: "0 auto", width: "100%" };

async function action(
  _state: { error: string | null },
  formData: FormData
): Promise<{ error: string | null }> {
  "use server";
  try {
    await createClientAction(formData);
    return { error: null };
  } catch (error) {
    // The action redirects to the admin clients list on success; the client was
    // already created by then, so send them to the standalone list instead. On
    // the standalone Proofer domain the middleware canonical redirect strips the
    // /proofer prefix, so this resolves to /clients there.
    if (isRedirectError(error)) redirect("/proofer/clients");
    return {
      error: error instanceof Error ? error.message : "Could not create client.",
    };
  }
}

export default async function ProoferNewClientPage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string; month?: string }>;
}) {
  const sp = await searchParams;
  const nav = await resolveNavData(sp.client, sp.month);
  // Clients is an Agency-plan feature — no direct-URL access for free/pro.
  if (!nav.showClients) redirect(nav.base || "/");
  return (
    <>
      <ProoferNav
        clients={nav.clients}
        clientId={nav.clientId}
        month={nav.month}
        pillars={nav.pillars}
        posts={nav.posts}
        teams={nav.teams}
        occupiedDates={nav.occupiedDates}
        isSuperAdmin={nav.superAdmin}
        showClients={nav.showClients}
        base={nav.base}
        parentOrigin={nav.parentOrigin}
      />
      <main style={mainStyle}>
        <div style={centerStyle}>
          <ClientForm
            title="Add Client"
            submitLabel="Create client"
            action={action}
            showConsultationImport
          />
        </div>
      </main>
    </>
  );
}
