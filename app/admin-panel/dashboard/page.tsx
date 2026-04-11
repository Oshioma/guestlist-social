"use client";

import { dashboardStats, clients, actions, ads, suggestions } from "../lib/data";
import StatCard from "../components/StatCard";
import SectionCard from "../components/SectionCard";
import ActionList from "../components/ActionList";
import ClientCard from "../components/ClientCard";
import SuggestionCard from "../components/SuggestionCard";
import AdRow from "../components/AdRow";
import AdFilterBar, {
  useAdFilter,
  getAdCounts,
} from "../components/AdFilterBar";

export default function DashboardPage() {
  const { filter, setFilter, filtered } = useAdFilter(ads);
  const counts = getAdCounts(ads);
  const problemClients = clients.filter((c) => c.status === "paused");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Stats row */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 16,
        }}
      >
        {dashboardStats.map((stat) => (
          <StatCard key={stat.label} stat={stat} />
        ))}
      </div>

      {/* Actions + Suggestions */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 16,
        }}
      >
        <SectionCard title="Today's Actions">
          <ActionList actions={actions} />
        </SectionCard>

        <SectionCard title="Suggestions">
          <div
            style={{ display: "flex", flexDirection: "column", gap: 10 }}
          >
            {suggestions.map((s) => (
              <SuggestionCard key={s.id} suggestion={s} />
            ))}
          </div>
        </SectionCard>
      </div>

      {/* Ads with filter */}
      <SectionCard title="Ads">
        <AdFilterBar
          current={filter}
          onChange={setFilter}
          counts={counts}
        />
        <div
          style={{
            display: "flex",
            alignItems: "center",
            padding: "8px 0",
            borderBottom: "1px solid #e4e4e7",
            gap: 12,
            fontSize: 12,
            color: "#a1a1aa",
            fontWeight: 500,
          }}
        >
          <div style={{ flex: 2 }}>Name</div>
          <div style={{ flex: 1 }}>Platform</div>
          <div style={{ width: 90 }}>Status</div>
          <div style={{ width: 80, textAlign: "right" }}>Spend</div>
          <div style={{ width: 90, textAlign: "right" }}>Impr.</div>
          <div style={{ width: 60, textAlign: "right" }}>Clicks</div>
          <div style={{ width: 60, textAlign: "right" }}>CTR</div>
          <div style={{ width: 160 }} />
        </div>
        {filtered.map((ad) => (
          <AdRow key={ad.id} ad={ad} />
        ))}
        {filtered.length === 0 && (
          <div
            style={{
              padding: "24px 0",
              textAlign: "center",
              color: "#a1a1aa",
              fontSize: 14,
            }}
          >
            No ads match this filter.
          </div>
        )}
      </SectionCard>

      {/* Needs attention */}
      <SectionCard title="Needs Attention">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 16,
          }}
        >
          {problemClients.length > 0 ? (
            problemClients.map((client) => (
              <ClientCard key={client.id} client={client} />
            ))
          ) : (
            <p style={{ fontSize: 14, color: "#a1a1aa", gridColumn: "1/-1" }}>
              All clients are performing well.
            </p>
          )}
        </div>
      </SectionCard>

      {/* All clients */}
      <SectionCard title="All Clients">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 16,
          }}
        >
          {clients.map((client) => (
            <ClientCard key={client.id} client={client} />
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
