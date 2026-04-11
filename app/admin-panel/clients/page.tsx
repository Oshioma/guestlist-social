import { clients } from "../lib/data";
import ClientCard from "../components/ClientCard";

export default function ClientsPage() {
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
            {clients.length} clients
          </p>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 16,
        }}
      >
        {clients.map((client) => (
          <ClientCard key={client.id} client={client} />
        ))}
      </div>
    </div>
  );
}
