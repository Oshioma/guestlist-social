import { getVideoIdeasData } from "../lib/queries";
import EmptyState from "../components/EmptyState";
import VideoIdeasBoard from "./VideoIdeasBoard";

export const dynamic = "force-dynamic";

function getNextTwoMonths(): { key: string; label: string }[] {
  const now = new Date();
  const months: { key: string; label: string }[] = [];

  for (let i = 0; i < 2; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("en-GB", {
      month: "long",
      year: "numeric",
    });
    months.push({ key, label });
  }

  return months;
}

export default async function VideoIdeasPage() {
  const months = getNextTwoMonths();

  try {
    const { clients, ideas } = await getVideoIdeasData();

    const totalIdeas = ideas.filter((i) =>
      months.some((m) => m.key === i.month)
    ).length;

    const clientsWithIdeas = new Set(
      ideas
        .filter((i) => months.some((m) => m.key === i.month))
        .map((i) => i.clientId)
    ).size;

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
            Video Ideas
          </h1>
          <p
            style={{
              margin: "6px 0 0",
              fontSize: 14,
              color: "#71717a",
            }}
          >
            Plan and manage video content ideas for each client by month.
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 12,
          }}
        >
          <StatBox label="Total Ideas" value={String(totalIdeas)} />
          <StatBox label="Clients with Ideas" value={String(clientsWithIdeas)} />
          <StatBox
            label="Clients without Ideas"
            value={String(clients.length - clientsWithIdeas)}
          />
        </div>

        <VideoIdeasBoard clients={clients} ideas={ideas} months={months} />
      </div>
    );
  } catch (error) {
    console.error("Video ideas page error:", error);
    return (
      <EmptyState
        title="Video ideas failed to load"
        description="Something went wrong while loading video ideas data."
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
