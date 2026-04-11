import { reports } from "../lib/data";
import SectionCard from "../components/SectionCard";
import { formatDate } from "../lib/utils";
import EmptyState from "../components/EmptyState";

export default function ReportsPage() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div>
        <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Reports</h2>
        <p style={{ fontSize: 14, color: "#71717a", margin: "4px 0 0" }}>
          All client reports in one place.
        </p>
      </div>

      {reports.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {reports.map((rpt) => (
            <SectionCard key={rpt.id} title={rpt.title}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  fontSize: 14,
                }}
              >
                <div style={{ color: "#52525b" }}>
                  {rpt.clientName} · {rpt.period}
                </div>
                <div style={{ color: "#a1a1aa", fontSize: 13 }}>
                  {formatDate(rpt.createdAt)}
                </div>
              </div>
            </SectionCard>
          ))}
        </div>
      ) : (
        <EmptyState
          title="No reports yet"
          description="Reports will appear here once they're created."
        />
      )}
    </div>
  );
}
