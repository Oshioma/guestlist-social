import AppShell from "../components/AppShell";
import SectionCard from "../components/SectionCard";
import StatCard from "../components/StatCard";
import ActionList from "../components/ActionList";
import ClientCard from "../components/ClientCard";
import SuggestionCard from "../components/SuggestionCard";
import AdRow from "../components/AdRow";

import { clients, actions, ads, suggestions } from "../lib/data";

export default function DashboardPage() {
  const winningAds = ads.filter((ad) => ad.status === "winner");
  const problemClients = clients.filter((c) => c.status === "needs_attention");

  return (
    <AppShell title="Dashboard">
      <div className="space-y-8">
        {/* TOP STATS */}
        <div className="grid gap-4 md:grid-cols-3">
          <StatCard label="Clients" value={clients.length.toString()} />
          <StatCard label="Active Ads" value={ads.length.toString()} />
          <StatCard
            label="Winning Ads"
            value={winningAds.length.toString()}
          />
        </div>

        {/* ACTIONS */}
        <SectionCard title="Today’s Actions">
          <ActionList actions={actions} />
        </SectionCard>

        {/* MAIN GRID */}
        <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
          {/* WINNING ADS */}
          <SectionCard title="Top Performing Ads">
            <div className="space-y-4">
              {winningAds.length > 0 ? (
                winningAds.map((ad) => <AdRow key={ad.id} ad={ad} />)
              ) : (
                <p className="text-sm text-gray-500">
                  No winning ads yet — keep testing.
                </p>
              )}
            </div>
          </SectionCard>

          {/* SUGGESTIONS */}
          <SuggestionCard suggestions={suggestions} />
        </div>

        {/* CLIENTS NEEDING ATTENTION */}
        <SectionCard title="Needs Attention">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {problemClients.length > 0 ? (
              problemClients.map((client) => (
                <ClientCard key={client.id} client={client} />
              ))
            ) : (
              <p className="text-sm text-gray-500">
                All clients are performing well.
              </p>
            )}
          </div>
        </SectionCard>

        {/* ALL CLIENTS */}
        <SectionCard title="All Clients">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {clients.map((client) => (
              <ClientCard key={client.id} client={client} />
            ))}
          </div>
        </SectionCard>
      </div>
    </AppShell>
  );
}
