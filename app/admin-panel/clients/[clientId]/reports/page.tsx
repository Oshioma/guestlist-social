import { mapDbClientToUiClient, mapDbReportToUiReport } from "../../../lib/mappers";
import { supabase } from "../../../lib/supabase";
import SectionCard from "../../../components/SectionCard";
import EmptyState from "../../../components/EmptyState";
import { formatDate } from "../../../lib/utils";

export const dynamic = "force-dynamic";

export default async function ClientReportsPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;

  const [clientRes, reportsRes] = await Promise.all([
    supabase.from("clients").select("*").eq("id", clientId).single(),
    supabase.from("reports").select("*").eq("client_id", clientId).order("created_at", { ascending: false }),
  ]);

  if (clientRes.error || !clientRes.data) {
    return <EmptyState title="Client not found" />;
  }

  const client = mapDbClientToUiClient(clientRes.data, 0);
  const reports = (reportsRes.data ?? []).map((r) => mapDbReportToUiReport(r, client.name));

  return (
    <div>
      <h2 style={{ fontSize: 18, fontWeight: 600, margin: "0 0 20px" }}>
        {client.name} — Reports
      </h2>

      {reports.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {reports.map((rpt) => (
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
