import { getStoryIdeasData } from "../lib/queries";
import EmptyState from "../components/EmptyState";
import StoryIdeasBoard from "./StoryIdeasBoard";

export const dynamic = "force-dynamic";

export default async function StoryIdeasPage() {
  try {
    const { clients, themes, ideas, pillars } = await getStoryIdeasData();

    const clientsWithContent = new Set([
      ...themes.map((t) => t.clientId),
      ...ideas.map((i) => i.clientId),
    ]).size;

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <div>
          <h1
            style={{
              margin: 0,
              fontSize: 24,
              fontWeight: 700,
              color: "#18181b",
              letterSpacing: "-0.02em",
            }}
          >
            Story Ideas
          </h1>
          <p
            style={{
              margin: "6px 0 0",
              fontSize: 14,
              color: "#71717a",
            }}
          >
            Plan story content strategy with monthly themes, goals, and categorized ideas for each client.
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 12,
          }}
        >
          <StatBox label="Themes" value={String(themes.length)} />
          <StatBox label="Total Ideas" value={String(ideas.length)} />
          <StatBox label="Clients with Strategy" value={String(clientsWithContent)} />
          <StatBox
            label="Clients without Strategy"
            value={String(Math.max(0, clients.length - clientsWithContent))}
          />
        </div>

        <StoryIdeasBoard
          clients={clients}
          themes={themes}
          ideas={ideas}
          pillars={pillars}
        />
      </div>
    );
  } catch (error) {
    console.error("Story ideas page error:", error);
    return (
      <EmptyState
        title="Story ideas failed to load"
        description="Something went wrong while loading story ideas data."
      />
    );
  }
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e4e4e7",
        borderRadius: 12,
        padding: 16,
      }}
    >
      <div style={{ fontSize: 12, color: "#71717a", marginBottom: 6 }}>
        {label}
      </div>
      <span style={{ fontSize: 22, fontWeight: 700, color: "#18181b" }}>
        {value}
      </span>
    </div>
  );
}
