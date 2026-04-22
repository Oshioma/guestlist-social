import Link from "next/link";
import { getDashboardData } from "../lib/queries";
import { canRunAds } from "@/lib/auth/permissions";
import ClientCard from "../components/ClientCard";
import EmptyState from "../components/EmptyState";
import TopPriorities from "../components/TopPriorities";
import WhatsWorkingNow from "../components/WhatsWorkingNow";
import DecisionAccuracy from "../components/DecisionAccuracy";
import TokenExpiryBanner from "../components/TokenExpiryBanner";
import type { Ad } from "../lib/types";

export const dynamic = "force-dynamic";

const ENGINE_TOOLS: {
  label: string;
  href: string;
  blurb: string;
  icon: string;
}[] = [
  {
    label: "Meta queue",
    href: "/app/meta-queue",
    blurb: "Approve engine changes before they hit Meta",
    icon: "⚡",
  },
  {
    label: "Playbook",
    href: "/app/whats-working",
    blurb: "Patterns that are working across every client",
    icon: "📘",
  },
  {
    label: "Creative library",
    href: "/app/creative",
    blurb: "Every ad, paired with outcome and next move",
    icon: "🖼",
  },
  {
    label: "Reports",
    href: "/app/reports",
    blurb: "Auto-generated client performance reports",
    icon: "📈",
  },
  {
    label: "Memory",
    href: "/app/memory",
    blurb: "Notes and preferences the engine remembers",
    icon: "🧠",
  },
];

function selectCreativePulseAds(ads: Ad[]) {
  const winners = ads
    .filter((ad) => ad.performanceStatus === "winner")
    .sort((a, b) => b.ctr - a.ctr)
    .slice(0, 4);

  const atRisk = ads
    .filter(
      (ad) =>
        ad.performanceStatus === "losing" ||
        (ad.performanceStatus === "testing" && ad.spend >= 40)
    )
    .sort((a, b) => b.spend - a.spend)
    .slice(0, 4);

  return { winners, atRisk };
}

function CreativePulseColumn({
  title,
  subtitle,
  ads,
  tone,
}: {
  title: string;
  subtitle: string;
  ads: Ad[];
  tone: "good" | "warn";
}) {
  const toneStyle =
    tone === "good"
      ? { bg: "#f0fdf4", border: "#bbf7d0", text: "#166534" }
      : { bg: "#fef2f2", border: "#fecaca", text: "#991b1b" };

  return (
    <div
      style={{
        border: `1px solid ${toneStyle.border}`,
        background: toneStyle.bg,
        borderRadius: 14,
        padding: 14,
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: toneStyle.text }}>
          {title}
        </h3>
        <span style={{ fontSize: 12, color: "#71717a" }}>{subtitle}</span>
      </div>
      {ads.length === 0 ? (
        <div style={{ marginTop: 10, fontSize: 12, color: "#71717a" }}>
          Nothing to show right now.
        </div>
      ) : (
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 10 }}>
          {ads.map((ad) => (
            <Link
              key={ad.id}
              href={`/app/clients/${ad.clientId}/ads/${ad.id}`}
              style={{
                textDecoration: "none",
                color: "inherit",
                display: "flex",
                gap: 10,
                alignItems: "center",
                padding: 8,
                borderRadius: 10,
                background: "#fff",
                border: "1px solid #e4e4e7",
              }}
            >
              <div
                style={{
                  width: 54,
                  height: 54,
                  borderRadius: 8,
                  overflow: "hidden",
                  border: "1px solid #e4e4e7",
                  background: "#f4f4f5",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 10,
                  color: "#a1a1aa",
                  flexShrink: 0,
                }}
              >
                {ad.creativeImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={ad.creativeImageUrl}
                    alt={ad.name}
                    loading="lazy"
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                ) : (
                  <span>No preview</span>
                )}
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: "#18181b",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {ad.name}
                </div>
                <div style={{ marginTop: 2, fontSize: 11, color: "#71717a" }}>
                  CTR {ad.ctr.toFixed(2)}% · £{ad.spend.toFixed(0)} spend
                </div>
              </div>
              <span
                style={{
                  padding: "2px 8px",
                  borderRadius: 999,
                  fontSize: 10,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  background:
                    ad.performanceStatus === "winner"
                      ? "#dcfce7"
                      : ad.performanceStatus === "losing"
                        ? "#fee2e2"
                        : "#fef3c7",
                  color:
                    ad.performanceStatus === "winner"
                      ? "#166534"
                      : ad.performanceStatus === "losing"
                        ? "#991b1b"
                        : "#92400e",
                }}
              >
                {ad.performanceStatus}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default async function DashboardPage() {
  await canRunAds();
  try {
    const { clients, ads } = await getDashboardData();

    const winningAds = ads.filter((ad) => ad.performanceStatus === "winner");
    const activeClients = clients.filter((c) => c.status === "active");
    const spendTotal = ads.reduce((sum, ad) => sum + ad.spend, 0);
    const avgCtr = ads.length > 0
      ? (ads.reduce((sum, ad) => sum + ad.ctr, 0) / ads.length).toFixed(1)
      : "0";
    const { winners: winnerShowcase, atRisk: atRiskShowcase } =
      selectCreativePulseAds(ads);

    const stats = [
      { label: "Clients", value: String(activeClients.length), sub: `${clients.length} total` },
      { label: "Total spend", value: `£${spendTotal.toFixed(0)}`, sub: `${ads.length} ads` },
      { label: "Winners", value: String(winningAds.length), sub: `${avgCtr}% avg CTR`, highlight: winningAds.length > 0 },
    ];

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

        <div
          style={{
            borderRadius: 16,
            padding: 18,
            border: "1px solid #c7d2fe",
            background: "linear-gradient(135deg,#eef2ff 0%, #f8fafc 100%)",
          }}
        >
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: "#18181b", letterSpacing: "-0.02em" }}>
            Engine Dashboard
          </h1>
          <p style={{ margin: "6px 0 0", fontSize: 13, color: "#52525b", maxWidth: 760 }}>
            Decision control room for what to scale, what to fix, and what to
            ship to Meta next.
          </p>
          <div
            style={{
              marginTop: 12,
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: 10,
            }}
          >
            {stats.map((s) => (
              <div
                key={s.label}
                style={{
                  padding: "10px 12px",
                  borderRadius: 12,
                  background: "#fff",
                  border: "1px solid #e4e4e7",
                }}
              >
                <div style={{ fontSize: 11, color: "#71717a" }}>{s.label}</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: s.highlight ? "#166534" : "#18181b" }}>
                  {s.value}
                </div>
                <div style={{ fontSize: 11, color: "#a1a1aa" }}>{s.sub}</div>
              </div>
            ))}
          </div>
        </div>

        <TokenExpiryBanner />

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: 12,
          }}
        >
          {ENGINE_TOOLS.map((tool) => (
            <Link
              key={tool.href}
              href={tool.href}
              style={{
                padding: "14px 16px",
                borderRadius: 12,
                background: "#fff",
                border: "1px solid #e4e4e7",
                textDecoration: "none",
                color: "inherit",
                display: "block",
                transition: "border-color 120ms ease, transform 120ms ease",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 700, color: "#18181b" }}>
                <span aria-hidden style={{ fontSize: 16 }}>{tool.icon}</span>
                {tool.label}
              </div>
              <div style={{ fontSize: 12, color: "#71717a", marginTop: 4 }}>
                {tool.blurb}
              </div>
            </Link>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <CreativePulseColumn
            title="Top creatives to scale"
            subtitle={`${winnerShowcase.length} showing`}
            ads={winnerShowcase}
            tone="good"
          />
          <CreativePulseColumn
            title="Creatives needing attention"
            subtitle={`${atRiskShowcase.length} showing`}
            ads={atRiskShowcase}
            tone="warn"
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "start" }}>
          <WhatsWorkingNow />
          <DecisionAccuracy />
        </div>

        <TopPriorities />

        <div>
          <h2 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 700, color: "#18181b" }}>
            Active clients ({activeClients.length})
          </h2>
          {activeClients.length > 0 ? (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                gap: 12,
              }}
            >
              {activeClients.map((client) => (
                <ClientCard key={client.id} client={client} />
              ))}
            </div>
          ) : (
            <EmptyState
              title="No active clients"
              description="Set a client to active to see them here."
            />
          )}
        </div>

        {clients.filter((c) => c.status !== "active").length > 0 && (
          <div>
            <h2 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 700, color: "#71717a" }}>
              Other clients ({clients.filter((c) => c.status !== "active").length})
            </h2>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                gap: 12,
                opacity: 0.7,
              }}
            >
              {clients.filter((c) => c.status !== "active").map((client) => (
                <ClientCard key={client.id} client={client} />
              ))}
            </div>
          </div>
        )}
      </div>
    );
  } catch (error) {
    console.error("Dashboard page error:", error);
    const message =
      error instanceof Error ? error.message : "Unknown error";
    return (
      <EmptyState
        title="Dashboard failed to load"
        description={message}
      />
    );
  }
}
