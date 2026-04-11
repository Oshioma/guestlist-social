import { createClient } from "@/lib/supabase/server";
import { generateClientReport, type ReportData } from "@/app/admin-panel/lib/report-actions";
import SectionCard from "@/app/admin-panel/components/SectionCard";
import EmptyState from "@/app/admin-panel/components/EmptyState";
import GenerateReportsButton from "@/app/admin-panel/components/GenerateReportsButton";
import { formatCurrency, formatDate } from "@/app/admin-panel/lib/utils";

export const dynamic = "force-dynamic";

export default async function ClientReportsPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  const supabase = await createClient();

  const [{ data: client, error: clientError }, { data: reportRows }] =
    await Promise.all([
      supabase.from("clients").select("id, name").eq("id", clientId).single(),
      supabase
        .from("reports")
        .select("*")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false }),
    ]);

  if (clientError || !client) {
    return <EmptyState title="Client not found" />;
  }

  const reports = reportRows ?? [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>
            {client.name} — Reports
          </h2>
          <p style={{ fontSize: 14, color: "#71717a", margin: "4px 0 0" }}>
            Performance reports generated from real data.
          </p>
        </div>
        <GenerateReportsButton
          action={async () => {
            "use server";
            await generateClientReport(clientId);
          }}
          label="Generate report"
        />
      </div>

      {reports.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {reports.map((rpt) => {
            const data = rpt.data as ReportData | null;
            return (
              <SectionCard key={rpt.id} title={rpt.title ?? "Report"}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: 13,
                    color: "#71717a",
                    marginBottom: 16,
                  }}
                >
                  <span>{rpt.period}</span>
                  <span>
                    {rpt.created_at ? formatDate(rpt.created_at) : ""}
                  </span>
                </div>

                {data ? (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 16,
                    }}
                  >
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(4, 1fr)",
                        gap: 12,
                      }}
                    >
                      <StatBox
                        label="Total spend"
                        value={formatCurrency(data.summary.totalSpend)}
                      />
                      <StatBox
                        label="Impressions"
                        value={data.summary.totalImpressions.toLocaleString()}
                      />
                      <StatBox
                        label="Clicks"
                        value={data.summary.totalClicks.toLocaleString()}
                      />
                      <StatBox
                        label="Avg CTR"
                        value={
                          data.summary.avgCtr > 0
                            ? `${data.summary.avgCtr}%`
                            : "—"
                        }
                      />
                    </div>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(4, 1fr)",
                        gap: 12,
                      }}
                    >
                      <StatBox
                        label="Actions opened"
                        value={String(data.actions.opened)}
                      />
                      <StatBox
                        label="In progress"
                        value={String(data.actions.inProgress)}
                      />
                      <StatBox
                        label="Completed"
                        value={String(data.actions.completed)}
                      />
                      <StatBox
                        label="Learnings"
                        value={String(data.learningsCount)}
                      />
                    </div>

                    {data.topAds.length > 0 && (
                      <div>
                        <div
                          style={{
                            fontSize: 13,
                            fontWeight: 600,
                            color: "#18181b",
                            marginBottom: 8,
                          }}
                        >
                          Top performing ads
                        </div>
                        {data.topAds.map((ad, i) => (
                          <div
                            key={i}
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              padding: "6px 10px",
                              borderRadius: 8,
                              background: i === 0 ? "#dcfce7" : "#fafafa",
                              border: "1px solid #f4f4f5",
                              marginBottom: 4,
                              fontSize: 13,
                            }}
                          >
                            <span>{ad.name}</span>
                            <span
                              style={{
                                color: "#16a34a",
                                fontWeight: 600,
                              }}
                            >
                              {ad.ctr}% CTR &middot;{" "}
                              {formatCurrency(ad.spend)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {data.campaignBreakdown.length > 0 && (
                      <div>
                        <div
                          style={{
                            fontSize: 13,
                            fontWeight: 600,
                            color: "#18181b",
                            marginBottom: 8,
                          }}
                        >
                          Campaign breakdown
                        </div>
                        {data.campaignBreakdown.map((c, i) => (
                          <div
                            key={i}
                            style={{
                              padding: "8px 10px",
                              borderRadius: 8,
                              border: "1px solid #f4f4f5",
                              background: "#fafafa",
                              marginBottom: 4,
                              fontSize: 13,
                              display: "flex",
                              justifyContent: "space-between",
                            }}
                          >
                            <span style={{ fontWeight: 500 }}>{c.name}</span>
                            <span style={{ color: "#71717a" }}>
                              {c.adCount} ads &middot;{" "}
                              {formatCurrency(c.spend)} &middot;{" "}
                              {c.avgCtr > 0 ? `${c.avgCtr}% CTR` : "No data"}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <p style={{ fontSize: 13, color: "#a1a1aa", margin: 0 }}>
                    Report data not available.
                  </p>
                )}
              </SectionCard>
            );
          })}
        </div>
      ) : (
        <EmptyState
          title="No reports yet"
          description='Click "Generate report" to create a report from this client&#39;s real data.'
        />
      )}
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        padding: "10px 12px",
        borderRadius: 10,
        border: "1px solid #f4f4f5",
        background: "#fafafa",
      }}
    >
      <div style={{ fontSize: 11, color: "#71717a", marginBottom: 2 }}>
        {label}
      </div>
      <div style={{ fontSize: 16, fontWeight: 700, color: "#18181b" }}>
        {value}
      </div>
    </div>
  );
}
