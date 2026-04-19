import { createClient } from "@/lib/supabase/server";
import { generateAllClientReports, type ReportData } from "@/app/admin-panel/lib/report-actions";
import SectionCard from "@/app/admin-panel/components/SectionCard";
import EmptyState from "@/app/admin-panel/components/EmptyState";
import GenerateReportsButton from "@/app/admin-panel/components/GenerateReportsButton";
import { formatCurrency, formatDate } from "@/app/admin-panel/lib/utils";
import EngineNav from "@/app/admin-panel/components/EngineNav";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const supabase = await createClient();

  const { data: reportRows } = await supabase
    .from("reports")
    .select("*, clients(name)")
    .order("created_at", { ascending: false });

  const reports = reportRows ?? [];

  async function handleGenerateAll() {
    "use server";
    await generateAllClientReports();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <EngineNav />
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
          <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Reports</h2>
          <p style={{ fontSize: 14, color: "#71717a", margin: "4px 0 0" }}>
            Generated from your real client, campaign, and ad data.
          </p>
        </div>
        <GenerateReportsButton
          action={handleGenerateAll}
          label="Generate all client reports"
        />
      </div>

      {reports.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {reports.map((rpt) => {
            const clientName =
              (rpt.clients as { name: string } | null)?.name ??
              "Unknown client";
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
                  <span>
                    {clientName} &middot; {rpt.period}
                  </span>
                  <span>{rpt.created_at ? formatDate(rpt.created_at) : ""}</span>
                </div>

                {data ? (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 16,
                    }}
                  >
                    {/* Summary stats */}
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

                    {/* Ads breakdown */}
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(4, 1fr)",
                        gap: 12,
                      }}
                    >
                      <StatBox
                        label="Total ads"
                        value={String(data.summary.adCount)}
                      />
                      <StatBox
                        label="Active"
                        value={String(data.summary.activeAds)}
                      />
                      <StatBox
                        label="Paused"
                        value={String(data.summary.pausedAds)}
                      />
                      <StatBox
                        label="Ended"
                        value={String(data.summary.endedAds)}
                      />
                    </div>

                    {/* Actions + Learnings */}
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

                    {/* Top + Bottom ads side by side */}
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: 16,
                      }}
                    >
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
                              <span style={{ color: "#18181b" }}>{ad.name}</span>
                              <span style={{ color: "#16a34a", fontWeight: 600 }}>
                                {ad.ctr}% CTR
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      {data.bottomAds.length > 0 && (
                        <div>
                          <div
                            style={{
                              fontSize: 13,
                              fontWeight: 600,
                              color: "#18181b",
                              marginBottom: 8,
                            }}
                          >
                            Needs attention
                          </div>
                          {data.bottomAds.map((ad, i) => (
                            <div
                              key={i}
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                padding: "6px 10px",
                                borderRadius: 8,
                                background: i === 0 ? "#fee2e2" : "#fafafa",
                                border: "1px solid #f4f4f5",
                                marginBottom: 4,
                                fontSize: 13,
                              }}
                            >
                              <span style={{ color: "#18181b" }}>{ad.name}</span>
                              <span style={{ color: "#dc2626", fontWeight: 600 }}>
                                {ad.ctr}% CTR
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Campaign breakdown */}
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
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
                            gap: 8,
                          }}
                        >
                          {data.campaignBreakdown.map((c, i) => (
                            <div
                              key={i}
                              style={{
                                padding: "10px 12px",
                                borderRadius: 10,
                                border: "1px solid #e4e4e7",
                                background: "#fafafa",
                              }}
                            >
                              <div
                                style={{
                                  fontSize: 14,
                                  fontWeight: 600,
                                  color: "#18181b",
                                  marginBottom: 4,
                                }}
                              >
                                {c.name}
                              </div>
                              <div
                                style={{
                                  fontSize: 12,
                                  color: "#71717a",
                                }}
                              >
                                {c.adCount} ads &middot;{" "}
                                {formatCurrency(c.spend)} spent &middot;{" "}
                                {c.avgCtr > 0 ? `${c.avgCtr}% CTR` : "No data"}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <p style={{ fontSize: 13, color: "#a1a1aa", margin: 0 }}>
                    Report data not available (generated before data tracking
                    was added).
                  </p>
                )}
              </SectionCard>
            );
          })}
        </div>
      ) : (
        <EmptyState
          title="No reports yet"
          description='Click "Generate all client reports" to create reports from your real data.'
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
