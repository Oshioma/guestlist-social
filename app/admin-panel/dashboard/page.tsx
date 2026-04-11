import { dashboardStats, actions, suggestions, ads } from "../lib/data";
import StatCard from "../components/StatCard";
import SectionCard from "../components/SectionCard";
import ActionList from "../components/ActionList";
import SuggestionCard from "../components/SuggestionCard";
import AdRow from "../components/AdRow";

export default function Dashboard() {
  const activeAds = ads.filter((a) => a.status === "active");

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

      {/* Two-column: Actions + Suggestions */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 16,
        }}
      >
        <SectionCard title="Actions">
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

      {/* Active ads */}
      <SectionCard title="Active Ads">
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
        </div>
        {activeAds.map((ad) => (
          <AdRow key={ad.id} ad={ad} />
        ))}
      </SectionCard>
    </div>
  );
}
