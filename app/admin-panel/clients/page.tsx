import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import EmptyState from "../components/EmptyState";
import StatusPill from "../components/StatusPill";
import SectionCard from "../components/SectionCard";
import { formatCurrency } from "../lib/utils";

export const dynamic = "force-dynamic";

type ClientRow = {
  id: number | string;
  name: string;
  platform?: string | null;
  monthly_budget?: number | string | null;
  status?: string | null;
  website_url?: string | null;
  industry?: string | null;
  notes?: string | null;
  archived?: boolean | null;
  created_at?: string | null;
};

type CampaignRow = {
  id: number | string;
  client_id?: number | string | null;
};

type AdRow = {
  id: number | string;
  client_id?: number | string | null;
  spend?: number | string | null;
};

export default async function ClientsPage() {
  const supabase = await createClient();

  const [clientsRes, campaignsRes, adsRes] = await Promise.all([
    supabase
      .from("clients")
      .select("*")
      .eq("archived", false)
      .order("created_at", { ascending: false }),
    supabase.from("campaigns").select("id, client_id"),
    supabase.from("ads").select("id, client_id, spend"),
  ]);

  if (clientsRes.error) {
    return (
      <EmptyState
        title="Unable to load clients"
        description={clientsRes.error.message}
      />
    );
  }

  const clients = (clientsRes.data ?? []) as ClientRow[];
  const campaigns = (campaignsRes.data ?? []) as CampaignRow[];
  const ads = (adsRes.data ?? []) as AdRow[];

  if (clients.length === 0) {
    return (
      <EmptyState
        title="No clients yet"
        description="Create your first client to start tracking campaigns, ads, and learnings."
      />
    );
  }

  const totalBudget = clients.reduce(
    (sum, client) => sum + Number(client.monthly_budget ?? 0),
    0
  );

  const totalSpend = ads.reduce((sum, ad) => sum + Number(ad.spend ?? 0), 0);

  const unassignedCampaigns = campaigns.filter(
    (campaign) => campaign.client_id === null || campaign.client_id === undefined
  ).length;

  const stats = [
    {
      label: "Clients",
      value: String(clients.length),
    },
    {
      label: "Campaigns",
      value: String(campaigns.length),
    },
    {
      label: "Monthly Budget",
      value: formatCurrency(totalBudget),
    },
    {
      label: "Ad Spend Logged",
      value: formatCurrency(totalSpend),
      subtext:
        unassignedCampaigns > 0
          ? `${unassignedCampaigns} unassigned campaign${
              unassignedCampaigns === 1 ? "" : "s"
            }`
          : "All campaigns assigned",
    },
  ];

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
          <h1
            style={{
              margin: 0,
              fontSize: 30,
              lineHeight: 1.05,
              fontWeight: 700,
              color: "#18181b",
              letterSpacing: "-0.03em",
            }}
          >
            Clients
          </h1>
          <p
            style={{
              margin: "8px 0 0",
              fontSize: 14,
              color: "#71717a",
              maxWidth: 760,
            }}
          >
            Manage clients, review performance at a glance, and open each client
            workspace to assign campaigns, review ads, and track learnings.
          </p>
        </div>

        <Link
          href="/app/clients/new"
          style={{
            display: "inline-flex",
            alignItems: "center",
            padding: "10px 14px",
            borderRadius: 10,
            background: "#18181b",
            color: "#fff",
            textDecoration: "none",
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          New client
        </Link>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
          gap: 16,
        }}
      >
        {stats.map((stat) => (
          <div
            key={stat.label}
            style={{
              border: "1px solid #e4e4e7",
              borderRadius: 16,
              padding: 16,
              background: "#fff",
            }}
          >
            <div style={{ fontSize: 12, color: "#71717a" }}>{stat.label}</div>
            <div
              style={{
                marginTop: 6,
                fontSize: 24,
                fontWeight: 700,
                color: "#18181b",
              }}
            >
              {stat.value}
            </div>
            {"subtext" in stat && stat.subtext ? (
              <div
                style={{
                  marginTop: 6,
                  fontSize: 12,
                  color: "#71717a",
                }}
              >
                {stat.subtext}
              </div>
            ) : null}
          </div>
        ))}
      </div>

      <SectionCard title={`All clients (${clients.length})`}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {clients.map((client) => {
            const clientCampaigns = campaigns.filter(
              (campaign) => String(campaign.client_id) === String(client.id)
            );

            const clientAds = ads.filter(
              (ad) => String(ad.client_id) === String(client.id)
            );

            const clientSpend = clientAds.reduce(
              (sum, ad) => sum + Number(ad.spend ?? 0),
              0
            );

            return (
              <div
                key={client.id}
                style={{
                  border: "1px solid #e4e4e7",
                  borderRadius: 16,
                  padding: 16,
                  background: "#fff",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 16,
                    alignItems: "flex-start",
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        flexWrap: "wrap",
                      }}
                    >
                      <h2
                        style={{
                          margin: 0,
                          fontSize: 18,
                          lineHeight: 1.1,
                          fontWeight: 700,
                          color: "#18181b",
                        }}
                      >
                        {client.name}
                      </h2>
                      <StatusPill status={(client.status as "active" | "paused" | "onboarding") ?? "active"} />
                    </div>

                    <p
                      style={{
                        margin: "8px 0 0",
                        fontSize: 13,
                        color: "#71717a",
                      }}
                    >
                      {client.platform ?? "No platform"} ·{" "}
                      {client.industry ?? "No industry"}
                    </p>

                    {client.website_url ? (
                      <p
                        style={{
                          margin: "6px 0 0",
                          fontSize: 12,
                          color: "#a1a1aa",
                          wordBreak: "break-word",
                        }}
                      >
                        {client.website_url}
                      </p>
                    ) : null}
                  </div>

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <Link
                      href={`/app/clients/${client.id}`}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        padding: "8px 12px",
                        borderRadius: 10,
                        background: "#18181b",
                        color: "#fff",
                        textDecoration: "none",
                        fontSize: 13,
                        fontWeight: 600,
                      }}
                    >
                      Open client
                    </Link>

                    <Link
                      href={`/app/clients/${client.id}/edit`}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        padding: "8px 12px",
                        borderRadius: 10,
                        border: "1px solid #e4e4e7",
                        background: "#fff",
                        color: "#18181b",
                        textDecoration: "none",
                        fontSize: 13,
                        fontWeight: 600,
                      }}
                    >
                      Edit
                    </Link>
                  </div>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                    gap: 12,
                    marginTop: 14,
                  }}
                >
                  <div
                    style={{
                      border: "1px solid #f4f4f5",
                      borderRadius: 12,
                      padding: 12,
                      background: "#fafafa",
                    }}
                  >
                    <div style={{ fontSize: 12, color: "#71717a" }}>
                      Monthly budget
                    </div>
                    <div
                      style={{
                        marginTop: 4,
                        fontSize: 15,
                        fontWeight: 600,
                        color: "#18181b",
                      }}
                    >
                      {formatCurrency(Number(client.monthly_budget ?? 0))}
                    </div>
                  </div>

                  <div
                    style={{
                      border: "1px solid #f4f4f5",
                      borderRadius: 12,
                      padding: 12,
                      background: "#fafafa",
                    }}
                  >
                    <div style={{ fontSize: 12, color: "#71717a" }}>
                      Campaigns
                    </div>
                    <div
                      style={{
                        marginTop: 4,
                        fontSize: 15,
                        fontWeight: 600,
                        color: "#18181b",
                      }}
                    >
                      {clientCampaigns.length}
                    </div>
                  </div>

                  <div
                    style={{
                      border: "1px solid #f4f4f5",
                      borderRadius: 12,
                      padding: 12,
                      background: "#fafafa",
                    }}
                  >
                    <div style={{ fontSize: 12, color: "#71717a" }}>Ads</div>
                    <div
                      style={{
                        marginTop: 4,
                        fontSize: 15,
                        fontWeight: 600,
                        color: "#18181b",
                      }}
                    >
                      {clientAds.length}
                    </div>
                  </div>

                  <div
                    style={{
                      border: "1px solid #f4f4f5",
                      borderRadius: 12,
                      padding: 12,
                      background: "#fafafa",
                    }}
                  >
                    <div style={{ fontSize: 12, color: "#71717a" }}>
                      Spend logged
                    </div>
                    <div
                      style={{
                        marginTop: 4,
                        fontSize: 15,
                        fontWeight: 600,
                        color: "#18181b",
                      }}
                    >
                      {formatCurrency(clientSpend)}
                    </div>
                  </div>
                </div>

                {client.notes ? (
                  <div
                    style={{
                      marginTop: 14,
                      border: "1px solid #f4f4f5",
                      borderRadius: 12,
                      padding: 12,
                      background: "#fafafa",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: "#71717a",
                        marginBottom: 6,
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                      }}
                    >
                      Notes
                    </div>
                    <div
                      style={{
                        fontSize: 13,
                        color: "#52525b",
                        whiteSpace: "pre-wrap",
                      }}
                    >
                      {client.notes}
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </SectionCard>
    </div>
  );
}
