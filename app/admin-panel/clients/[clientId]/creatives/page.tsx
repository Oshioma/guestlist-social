import { clients, creatives } from "../../../lib/data";
import CreativeCard from "../../../components/CreativeCard";
import EmptyState from "../../../components/EmptyState";

export default async function ClientCreativesPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  const client = clients.find((c) => c.id === clientId);
  const clientCreatives = creatives.filter((c) => c.clientId === clientId);

  if (!client) {
    return <EmptyState title="Client not found" />;
  }

  return (
    <div>
      <h2 style={{ fontSize: 18, fontWeight: 600, margin: "0 0 20px" }}>
        {client.name} — Creatives
      </h2>

      {clientCreatives.length > 0 ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 16,
          }}
        >
          {clientCreatives.map((cr) => (
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
