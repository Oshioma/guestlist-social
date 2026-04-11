import { clients, reports } from "../../../lib/data";
import SectionCard from "../../../components/SectionCard";
import EmptyState from "../../../components/EmptyState";
import { formatDate } from "../../../lib/utils";

export default async function ClientReportsPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  const client = clients.find((c) => c.id === clientId);
  const clientReports = reports.filter((r) => r.clientId === clientId);

  if (!client) {
    return <EmptyState title="Client not found" />;
  }

  return (
    <div>
      <h2 style={{ fontSize: 18, fontWeight: 600, margin: "0 0 20px" }}>
        {client.name} — Reports
      </h2>

      {clientReports.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {clientReports.map((rpt) => (
            <SectionCard key={rpt.id} title={rpt.title}>
              <div style={{ fontSize: 14, color: "#71717a" }}>
                Period: {rpt.period} · Created {formatDate(rpt.createdAt)}
              </div>
            </SectionCard>
          ))}
        </div>
      ) : (
        <EmptyState
          title="No reports yet"
          description="Reports will appear here after the first review period."
        />
      )}
    </div>
  );
}
