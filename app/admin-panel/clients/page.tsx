import Link from "next/link";
import { createClient } from "../../../lib/supabase/server";
import { mapDbAdToUiAd, mapDbClientToUiClient } from "../lib/mappers";
import ClientCard from "../components/ClientCard";
import EmptyState from "../components/EmptyState";

export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  const supabase = await createClient();

  const [clientsRes, adsRes] = await Promise.all([
    supabase.from("clients").select("*").order("created_at", { ascending: false }),
    supabase.from("ads").select("*"),
  ]);

  const ads = (adsRes.data ?? []).map(mapDbAdToUiAd);
  const clients = (clientsRes.data ?? []).map((row) => {
    const adCount = ads.filter((a) => a.clientId === row.id).length;
    return mapDbClientToUiClient(row, adCount);
  });

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 20,
        }}
      >
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>
            All Clients
          </h2>
          <p style={{ fontSize: 14, color: "#71717a", margin: "4px 0 0" }}>
            {clients.length} client{clients.length === 1 ? "" : "s"}
          </p>
        </div>

        <Link
          href="/app/clients/new"
          style={{
            padding: "10px 16px",
            fontSize: 14,
            fontWeight: 600,
            border: "none",
            borderRadius: 10,
            background: "#18181b",
            color: "#fff",
            textDecoration: "none",
          }}
        >
          New client
        </Link>
      </div>

      {clients.length > 0 ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: 16,
          }}
        >
          {clients.map((client) => (
            <ClientCard key={client.id} client={client} />
          ))}
        </div>
      ) : (
        <EmptyState
          title="No clients yet"
          description="Add your first client to get started."
        />
      )}
    </div>
  );
}
