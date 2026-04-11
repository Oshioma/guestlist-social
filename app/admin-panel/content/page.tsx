import { getContentDashboardData, getVideoIdeasData, getCarouselIdeasData, getStoryIdeasData } from "../lib/queries";
import SectionCard from "../components/SectionCard";
import EmptyState from "../components/EmptyState";
import ContentGrid from "./ContentGrid";
import Link from "next/link";

export const dynamic = "force-dynamic";

function getNextFiveMonths(): { key: string; label: string }[] {
  const now = new Date();
  const months: { key: string; label: string }[] = [];

  for (let i = 0; i < 5; i++) {
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
  const months = getNextFiveMonths();

  try {
    const [{ clients, progress }, ideasData, carouselData, storyData] = await Promise.all([
      getContentDashboardData(),
      getVideoIdeasData().catch(() => ({ clients: [], themes: [], ideas: [] })),
      getCarouselIdeasData().catch(() => ({ clients: [], themes: [], ideas: [] })),
      getStoryIdeasData().catch(() => ({ clients: [], themes: [], ideas: [] })),
    ]);

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

        <SectionCard
          title="Content Ideas Overview"
          action={
            <div style={{ display: "flex", gap: 8 }}>
              <Link href="/app/video-ideas" style={actionLinkStyle("#dcfce7", "#166534")}>+ Video</Link>
              <Link href="/app/carousel-ideas" style={actionLinkStyle("#dbeafe", "#1e40af")}>+ Carousel</Link>
              <Link href="/app/story-ideas" style={actionLinkStyle("#fef9c3", "#854d0e")}>+ Story</Link>
            </div>
          }
        >
          {/* Legend */}
          <div style={{ display: "flex", gap: 16, marginBottom: 12, fontSize: 11, color: "#71717a", alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <span style={{ ...tagDot, background: "#166534" }} /> Video
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <span style={{ ...tagDot, background: "#1e40af" }} /> Carousel
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <span style={{ ...tagDot, background: "#854d0e" }} /> Story
            </span>
            <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
              <Link href="/app/video-ideas" style={{ fontSize: 11, color: "#166534", textDecoration: "underline" }}>Manage Video</Link>
              <Link href="/app/carousel-ideas" style={{ fontSize: 11, color: "#1e40af", textDecoration: "underline" }}>Manage Carousel</Link>
              <Link href="/app/story-ideas" style={{ fontSize: 11, color: "#854d0e", textDecoration: "underline" }}>Manage Story</Link>
            </div>
          </div>

          {clients.length === 0 ? (
            <div style={{ color: "#a1a1aa", fontSize: 14, padding: "16px 0" }}>No clients yet.</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, fontSize: 13 }}>
                <thead>
                  <tr>
                    <th style={thStyle}>Client</th>
                    {months.map((m) => (
                      <th key={m.key} style={{ ...thStyle, textAlign: "center", padding: "8px 6px" }}>
                        {m.label.split(" ")[0]}
                      </th>
                    ))}
                    <th style={{ ...thStyle, textAlign: "center", padding: "8px 6px" }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {clients.map((client, idx) => {
                    const vAll = ideasData.ideas.filter((i) => i.clientId === client.id);
                    const cAll = carouselData.ideas.filter((i) => i.clientId === client.id);
                    const sAll = storyData.ideas.filter((i) => i.clientId === client.id);

                    return (
                      <tr key={client.id} style={{ background: idx % 2 === 0 ? "#fff" : "#fafafa" }}>
                        <td style={{ ...tdStyle, fontWeight: 500, fontSize: 13, padding: "10px 12px" }}>
                          {client.name}
                        </td>
                        {months.map((m) => {
                          const vCount = vAll.filter((i) => i.month === m.key).length;
                          const cCount = cAll.filter((i) => i.month === m.key).length;
                          const sCount = sAll.filter((i) => i.month === m.key).length;
                          const hasAny = vCount + cCount + sCount > 0;

                          return (
                            <td key={m.key} style={{ ...tdStyle, textAlign: "center", padding: "6px 4px", verticalAlign: "middle" }}>
                              {hasAny ? (
                                <div style={{ display: "flex", gap: 3, justifyContent: "center", alignItems: "center", flexWrap: "wrap" }}>
                                  {vCount > 0 && <span style={miniTag("#dcfce7", "#166534")}>{vCount}</span>}
                                  {cCount > 0 && <span style={miniTag("#dbeafe", "#1e40af")}>{cCount}</span>}
                                  {sCount > 0 && <span style={miniTag("#fef9c3", "#854d0e")}>{sCount}</span>}
                                </div>
                              ) : (
                                <span style={{ color: "#e4e4e7", fontSize: 12 }}>-</span>
                              )}
                            </td>
                          );
                        })}
                        <td style={{ ...tdStyle, textAlign: "center", padding: "6px 4px" }}>
                          <div style={{ display: "flex", gap: 3, justifyContent: "center", alignItems: "center" }}>
                            <span style={miniTag("#dcfce7", "#166534")}>{vAll.length}</span>
                            <span style={miniTag("#dbeafe", "#1e40af")}>{cAll.length}</span>
                            <span style={miniTag("#fef9c3", "#854d0e")}>{sAll.length}</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
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

function actionLinkStyle(bg: string, color: string): React.CSSProperties {
  return {
    fontSize: 12,
    fontWeight: 600,
    color,
    background: bg,
    padding: "6px 12px",
    borderRadius: 999,
    textDecoration: "none",
    whiteSpace: "nowrap",
  };
}

const tagDot: React.CSSProperties = {
  display: "inline-block",
  width: 8,
  height: 8,
  borderRadius: 999,
};

function miniTag(bg: string, color: string): React.CSSProperties {
  return {
    display: "inline-block",
    minWidth: 18,
    padding: "1px 5px",
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 700,
    background: bg,
    color,
    lineHeight: "16px",
    textAlign: "center",
  };
}

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "10px 14px",
  fontWeight: 600,
  fontSize: 13,
  color: "#71717a",
  borderBottom: "2px solid #e4e4e7",
  whiteSpace: "nowrap",
};

const tdStyle: React.CSSProperties = {
  padding: "12px 14px",
  borderBottom: "1px solid #f4f4f5",
  whiteSpace: "nowrap",
};

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
