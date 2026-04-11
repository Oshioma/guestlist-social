import SectionCard from "../components/SectionCard";
import StatCard from "../components/StatCard";
import ClientCard from "../components/ClientCard";
import SuggestionCard from "../components/SuggestionCard";
import AdRow from "../components/AdRow";
import EmptyState from "../components/EmptyState";
import ActionList from "../components/ActionList";
import { supabase } from "../lib/supabase";

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

  const clients = clientsRes.data ?? [];
  const ads = adsRes.data ?? [];
  const actions = actionsRes.data ?? [];
  const suggestions = suggestionsRes.data ?? [];

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
