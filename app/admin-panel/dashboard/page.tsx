import SectionCard from "../components/SectionCard";
import StatCard from "../components/StatCard";
import ClientCard from "../components/ClientCard";
import SuggestionCard from "../components/SuggestionCard";
import AdRow from "../components/AdRow";
import EmptyState from "../components/EmptyState";
import ActionList from "../components/ActionList";
import { supabase } from "../lib/supabase";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [clientsRes, adsRes, actionsRes, suggestionsRes] = await Promise.all([
    supabase.from("clients").select("*").order("created_at", { ascending: false }),
    supabase.from("ads").select("*").order("created_at", { ascending: false }),
    supabase
      .from("actions")
      .select("*")
      .eq("is_complete", false)
      .order("created_at", { ascending: false }),
    supabase.from("suggestions").select("*").order("created_at", { ascending: false }),
  ]);

  if (
    clientsRes.error ||
    adsRes.error ||
    actionsRes.error ||
    suggestionsRes.error
  ) {
    console.error("Dashboard load error:", {
      clients: clientsRes.error,
      ads: adsRes.error,
      actions: actionsRes.error,
      suggestions: suggestionsRes.error,
    });

    return (
      <EmptyState
        title="Dashboard failed to load"
        description="Check Supabase env vars, table structure, or RLS policies. See console for details."
      />
    );
  }

  const clients = (clientsRes.data ?? []).map((client) => ({
    id: client.id,
    name: client.name,
    platform: client.platform ?? "Meta",
    industry: client.industry ?? "",
    monthlyBudget: Number(client.monthly_budget ?? 0),
    status: client.status ?? "testing",
    websiteUrl: client.website_url ?? "",
    notes: client.notes ?? "",
  }));

  const ads = (adsRes.data ?? []).map((ad) => ({
    id: ad.id,
    clientId: ad.client_id,
    campaignId: ad.campaign_id,
    name: ad.name,
    status: ad.status ?? "testing",
    spend: Number(ad.spend ?? 0),
    costPerResult: Number(ad.cost_per_result ?? 0),
    followersGained: Number(ad.followers_gained ?? 0),
    clicks: Number(ad.clicks ?? 0),
    engagement: Number(ad.engagement ?? 0),
    impressions: Number(ad.impressions ?? 0),
    conversions: Number(ad.conversions ?? 0),
    audience: ad.audience ?? "",
    creativeHook: ad.creative_hook ?? "",
    notes: ad.notes ?? "",
  }));

  const actions = (actionsRes.data ?? []).map((action) => ({
    id: action.id,
    clientId: action.client_id,
    title: action.title,
    kind: action.kind,
    priority: action.priority ?? "medium",
    isComplete: action.is_complete ?? false,
    createdAt: action.created_at,
  }));

  const suggestions = (suggestionsRes.data ?? []).map((suggestion) => ({
    id: suggestion.id,
    clientId: suggestion.client_id,
    text: suggestion.text,
    priority: suggestion.priority ?? "medium",
    source: suggestion.source ?? "manual",
    createdAt: suggestion.created_at,
  }));

  const winningAds = ads.filter((ad) => ad.status === "winner");
  const problemClients = clients.filter(
    (client) => client.status === "needs_attention"
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 16,
        }}
      >
        <StatCard stat={{ label: "Clients", value: String(clients.length) }} />
        <StatCard stat={{ label: "Active Ads", value: String(ads.length) }} />
        <StatCard
          stat={{ label: "Winning Ads", value: String(winningAds.length) }}
        />
      </div>

      <SectionCard title="Today’s Actions">
        {actions.length > 0 ? (
          <ActionList actions={actions} />
        ) : (
          <EmptyState
            title="No open actions"
            description="You have cleared the current action list."
          />
        )}
      </SectionCard>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.4fr) minmax(320px, 1fr)",
          gap: 20,
        }}
      >
        <SectionCard title="Top Performing Ads">
          {winningAds.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
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
              suggestions.slice(0, 6).map((suggestion) => (
                <SuggestionCard key={suggestion.id} suggestion={suggestion} />
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

      <SectionCard title="Needs Attention">
        {problemClients.length > 0 ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: 12,
            }}
          >
            {problemClients.map((client) => (
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
  );
}
