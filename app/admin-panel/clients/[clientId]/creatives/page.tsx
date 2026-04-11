import { mapDbClientToUiClient, mapDbCreativeToUiCreative } from "../../../lib/mappers";
import { createClient } from "../../../../../lib/supabase/server";
import CreativeCard from "../../../components/CreativeCard";
import EmptyState from "../../../components/EmptyState";

export const dynamic = "force-dynamic";

export default async function ClientCreativesPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  const supabase = await createClient();

  const [clientRes, creativesRes] = await Promise.all([
    supabase.from("clients").select("*").eq("id", clientId).single(),
    supabase.from("creatives").select("*").eq("client_id", clientId).order("created_at", { ascending: false }),
  ]);

  if (clientRes.error || !clientRes.data) {
    return <EmptyState title="Client not found" />;
  }

  const client = mapDbClientToUiClient(clientRes.data, 0);
  const creatives = (creativesRes.data ?? []).map(mapDbCreativeToUiCreative);

  return (
    <div>
      <h2 style={{ fontSize: 18, fontWeight: 600, margin: "0 0 20px" }}>
        {client.name} — Creatives
      </h2>

      {creatives.length > 0 ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 16,
          }}
        >
          {creatives.map((cr) => (
            <CreativeCard key={cr.id} creative={cr} />
          ))}
        </div>
      ) : (
        <EmptyState
          title="No creatives yet"
          description="Upload assets for this client."
        />
      )}
    </div>
  );
}
