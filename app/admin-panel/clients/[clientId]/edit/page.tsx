import Link from "next/link";
import { createClient } from "../../../../../lib/supabase/server";
import { mapDbAdToUiAd, mapDbClientToUiClient } from "../../../lib/mappers";
import ClientForm from "../../../components/ClientForm";
import EmptyState from "../../../components/EmptyState";

export const dynamic = "force-dynamic";

export default async function EditClientPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  const supabase = await createClient();

  const [clientRes, adsRes] = await Promise.all([
    supabase.from("clients").select("*").eq("id", clientId).single(),
    supabase.from("ads").select("*").eq("client_id", clientId),
  ]);

  if (clientRes.error || !clientRes.data) {
    return <EmptyState title="Client not found" />;
  }

  const ads = (adsRes.data ?? []).map(mapDbAdToUiAd);
  const client = mapDbClientToUiClient(clientRes.data, ads.length);

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <Link
          href={`/app/clients/${clientId}`}
          style={{ fontSize: 13, color: "#71717a", textDecoration: "none" }}
        >
          &larr; Back to {client.name}
        </Link>
        <h2 style={{ fontSize: 18, fontWeight: 600, margin: "8px 0 0" }}>
          Edit Client
        </h2>
      </div>

      <ClientForm client={client} />
    </div>
  );
}
