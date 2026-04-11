import { getContentDashboardData } from "../lib/queries";
import SectionCard from "../components/SectionCard";
import EmptyState from "../components/EmptyState";
import ContentGrid from "./ContentGrid";

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

export default async function ContentDashboardPage() {
  const months = getNextTwoMonths();

  try {
    const { clients, progress } = await getContentDashboardData();

    const allKeys = [...months.map((m) => m.key), "video", "images", "strategy", "style_guide"];
    const relevantProgress = progress.filter((p) =>
      allKeys.includes(p.month)
    );

    const totalSlots = clients.length * allKeys.length;
    const completedSlots = relevantProgress.filter(
      (p) => p.status === "complete"
    ).length;
    const inProgressSlots = relevantProgress.filter(
      (p) => p.status === "in_progress"
    ).length;
    const proofSlots = relevantProgress.filter(
      (p) => p.status === "proof"
    ).length;

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
            Content Dashboard
          </h1>
          <p
            style={{
              margin: "6px 0 0",
              fontSize: 14,
              color: "#71717a",
            }}
          >
            Track content progress for each client across upcoming months.
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            gap: 12,
          }}
        >
          <StatBox
            label="Total Clients"
            value={String(clients.length)}
            bg="#f4f4f5"
            text="#18181b"
          />
          <StatBox
            label="Complete"
            value={String(completedSlots)}
            bg="#dcfce7"
            text="#166534"
          />
          <StatBox
            label="In Progress"
            value={String(inProgressSlots)}
            bg="#fef9c3"
            text="#854d0e"
          />
          <StatBox
            label="In Proof"
            value={String(proofSlots)}
            bg="#dbeafe"
            text="#1e40af"
          />
          <StatBox
            label="Not Started"
            value={String(totalSlots - completedSlots - inProgressSlots - proofSlots)}
            bg="#f3f4f6"
            text="#374151"
          />
        </div>

        <SectionCard title="Progress">
          <ContentGrid
            clients={clients}
            progress={relevantProgress}
            months={months}
          />
        </SectionCard>
      </div>
    );
  } catch (error) {
    console.error("Content dashboard error:", error);
    return (
      <EmptyState
        title="Content dashboard failed to load"
        description="Something went wrong while loading content data."
      />
    );
  }
}

function StatBox({
  label,
  value,
  bg,
  text,
}: {
  label: string;
  value: string;
  bg: string;
  text: string;
}) {
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
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span
          style={{
            fontSize: 22,
            fontWeight: 700,
            color: "#18181b",
          }}
        >
          {value}
        </span>
        <span
          style={{
            fontSize: 11,
            fontWeight: 500,
            padding: "2px 8px",
            borderRadius: 999,
            background: bg,
            color: text,
          }}
        >
          {label.toLowerCase()}
        </span>
      </div>
    </div>
  );
}
