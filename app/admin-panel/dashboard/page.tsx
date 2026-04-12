import { getDashboardData } from "../lib/queries";
import { createClient } from "@/lib/supabase/server";
import SectionCard from "../components/SectionCard";
import StatCard from "../components/StatCard";
import ClientCard from "../components/ClientCard";
import SuggestionCard from "../components/SuggestionCard";
import AdRow from "../components/AdRow";
import EmptyState from "../components/EmptyState";
import TopPriorities from "../components/TopPriorities";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  try {
    const { clients, ads, suggestions } = await getDashboardData();

    // Learnings — separate query so it doesn't break the page if table is missing
    let learningRows: any[] = [];
    try {
      const supabase = await createClient();
      const { data } = await supabase
        .from("learnings")
        .select("*, clients(name)")
        .order("created_at", { ascending: false });
      learningRows = data ?? [];
    } catch {
      // table may not exist yet
    }

    const winningAds = ads.filter((ad) => ad.status === "active" && ad.ctr >= 2.5);
    const activeClients = clients.filter((c) => c.status === "active");
    const onboardingClients = clients.filter((c) => c.status === "onboarding");
    const pausedClients = clients.filter((c) => c.status === "paused");
    const spendTotal = ads.reduce((sum, ad) => sum + ad.spend, 0);

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <div
          style={{
            position: "relative",
            overflow: "hidden",
            borderRadius: 20,
            padding: 24,
            background:
              "linear-gradient(135deg, #18181b 0%, #27272a 55%, #3f3f46 100%)",
            color: "#fff",
            border: "1px solid rgba(255,255,255,0.08)",
            boxShadow: "0 18px 50px rgba(0,0,0,0.18)",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: -60,
              right: -40,
              width: 220,
              height: 220,
              borderRadius: "50%",
              background: "rgba(255,255,255,0.06)",
              filter: "blur(8px)",
            }}
          />
          <div
            style={{
              position: "absolute",
              bottom: -70,
              left: -30,
              width: 180,
              height: 180,
              borderRadius: "50%",
              background: "rgba(255,255,255,0.04)",
              filter: "blur(8px)",
            }}
          />

          <div style={{ position: "relative", zIndex: 1 }}>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 10px",
                borderRadius: 999,
                background: "rgba(255,255,255,0.08)",
                border: "1px solid rgba(255,255,255,0.1)",
                fontSize: 12,
                marginBottom: 14,
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: "#4ade80",
                  display: "inline-block",
                }}
              />
              Live operator dashboard
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 20,
                alignItems: "flex-end",
                flexWrap: "wrap",
              }}
            >
              <div>
                <h1
                  style={{
                    margin: 0,
                    fontSize: 30,
                    lineHeight: 1.05,
                    fontWeight: 700,
                    letterSpacing: "-0.03em",
                  }}
                >
                  Growth Engine
                </h1>
                <p
                  style={{
                    margin: "10px 0 0",
                    fontSize: 14,
                    color: "rgba(255,255,255,0.75)",
                    maxWidth: 640,
                  }}
                >
                  A cleaner view of what is working, what needs attention, and what
                  to do next across your client ad accounts.
                </p>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, minmax(110px, 1fr))",
                  gap: 10,
                  minWidth: 320,
                }}
              >
                <div style={heroBoxStyle}>
                  <div style={heroLabelStyle}>Active clients</div>
                  <div style={heroValueStyle}>{activeClients.length}</div>
                </div>

                <div style={heroBoxStyle}>
                  <div style={heroLabelStyle}>Total spend</div>
                  <div style={heroValueStyle}>£{spendTotal.toFixed(0)}</div>
                </div>

                <div style={heroBoxStyle}>
                  <div style={heroLabelStyle}>Winning ads</div>
                  <div style={heroValueStyle}>{winningAds.length}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Top-3 priorities — the calmest and most decisive surface in the
            product. Everything below is supporting context. */}
        <TopPriorities />

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 16,
          }}
        >
          <StatCard
            stat={{
              label: "Clients",
              value: String(clients.length),
              change: `${activeClients.length} active`,
              trend: "up",
            }}
          />
          <StatCard
            stat={{
              label: "Active Ads",
              value: String(ads.length),
              change: `${winningAds.length} high performers`,
              trend: winningAds.length > 0 ? "up" : "flat",
            }}
          />
          <StatCard
            stat={{
              label: "Winning Ads",
              value: String(winningAds.length),
              change: pausedClients.length > 0 ? `${pausedClients.length} need attention` : "Stable",
              trend: pausedClients.length > 0 ? "down" : "flat",
            }}
          />
          <StatCard
            stat={{
              label: "Onboarding",
              value: String(onboardingClients.length),
              change: "Clients still warming up",
              trend: "flat",
            }}
          />
        </div>

        {/* Learnings */}
        <SectionCard title={`Learnings (${learningRows.length})`}>
          {learningRows.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {learningRows.slice(0, 10).map((learning: any) => {
                const clientName =
                  (learning.clients as { name: string } | null)?.name ??
                  "Unknown client";
                return (
                  <div
                    key={learning.id}
                    style={{
                      border: "1px solid #e4e4e7",
                      borderRadius: 14,
                      padding: 14,
                      background: "#fff",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                        gap: 8,
                        marginBottom: 6,
                      }}
                    >
                      <div
                        style={{
                          fontSize: 14,
                          fontWeight: 600,
                          color: "#18181b",
                        }}
                      >
                        {learning.problem || "Untitled learning"}
                      </div>
                      <span
                        style={{
                          fontSize: 11,
                          color: "#71717a",
                          background: "#f4f4f5",
                          padding: "2px 8px",
                          borderRadius: 999,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {clientName}
                      </span>
                    </div>
                    {learning.change_made ? (
                      <div
                        style={{
                          fontSize: 13,
                          color: "#52525b",
                          marginBottom: 4,
                        }}
                      >
                        <strong style={{ color: "#18181b" }}>Change:</strong>{" "}
                        {learning.change_made}
                      </div>
                    ) : null}
                    {learning.result ? (
                      <div
                        style={{
                          fontSize: 13,
                          color: "#52525b",
                          marginBottom: 4,
                        }}
                      >
                        <strong style={{ color: "#18181b" }}>Result:</strong>{" "}
                        {learning.result}
                      </div>
                    ) : null}
                    {learning.outcome ? (
                      <div style={{ fontSize: 13, color: "#71717a" }}>
                        <strong style={{ color: "#18181b" }}>Outcome:</strong>{" "}
                        {learning.outcome}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState
              title="No learnings yet"
              description="Completed actions can be turned into learnings from the campaign page."
            />
          )}
        </SectionCard>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1.35fr) minmax(320px, 1fr)",
            gap: 20,
            alignItems: "start",
          }}
        >
          <SectionCard
            title="Top Performing Ads"
            action={
              <span
                style={{
                  fontSize: 12,
                  color: "#71717a",
                  background: "#f4f4f5",
                  padding: "6px 10px",
                  borderRadius: 999,
                }}
              >
                CTR 2.5%+
              </span>
            }
          >
            {winningAds.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {winningAds.slice(0, 5).map((ad) => (
                  <AdRow key={ad.id} ad={ad} />
                ))}
              </div>
            ) : (
              <EmptyState
                title="No winning ads yet"
                description="Run more tests to start identifying strong performers."
              />
            )}
          </SectionCard>

          <SectionCard title="Suggestions">
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {suggestions.length > 0 ? (
                suggestions.slice(0, 6).map((s) => (
                  <SuggestionCard key={s.id} suggestion={s} />
                ))
              ) : (
                <EmptyState
                  title="No suggestions yet"
                  description="Suggestions will appear here as data builds up."
                />
              )}
            </div>
          </SectionCard>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 0.95fr) minmax(0, 1.25fr)",
            gap: 20,
            alignItems: "start",
          }}
        >
          <SectionCard title="Needs Attention">
            {pausedClients.length > 0 ? (
              <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 12 }}>
                {pausedClients.map((client) => (
                  <ClientCard key={client.id} client={client} />
                ))}
              </div>
            ) : (
              <EmptyState
                title="No clients need attention"
                description="Everything is stable right now."
              />
            )}
          </SectionCard>

          <SectionCard title="All Clients">
            {clients.length > 0 ? (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                  gap: 12,
                }}
              >
                {clients.map((client) => (
                  <ClientCard key={client.id} client={client} />
                ))}
              </div>
            ) : (
              <EmptyState
                title="No clients yet"
                description="Add your first client to start using the system."
              />
            )}
          </SectionCard>
        </div>
      </div>
    );
  } catch (error) {
    console.error("Dashboard page error:", error);
    return (
      <EmptyState
        title="Dashboard failed to load"
        description="Something went wrong while loading live data."
      />
    );
  }
}

const heroBoxStyle: React.CSSProperties = {
  borderRadius: 14,
  padding: 14,
  background: "rgba(255,255,255,0.07)",
  border: "1px solid rgba(255,255,255,0.08)",
};

const heroLabelStyle: React.CSSProperties = {
  fontSize: 11,
  color: "rgba(255,255,255,0.65)",
};

const heroValueStyle: React.CSSProperties = {
  marginTop: 6,
  fontSize: 24,
  fontWeight: 700,
};
