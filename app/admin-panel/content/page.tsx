import { getContentDashboardData, getVideoIdeasData, getCarouselIdeasData } from "../lib/queries";
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
    const [{ clients, progress }, ideasData, carouselData] = await Promise.all([
      getContentDashboardData(),
      getVideoIdeasData().catch(() => ({ clients: [], themes: [], ideas: [] })),
      getCarouselIdeasData().catch(() => ({ clients: [], themes: [], ideas: [] })),
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
          title="Video Ideas"
          action={
            <Link
              href="/app/video-ideas"
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: "#18181b",
                background: "#f4f4f5",
                padding: "6px 12px",
                borderRadius: 999,
                textDecoration: "none",
              }}
            >
              Manage Ideas
            </Link>
          }
        >
          {clients.length === 0 ? (
            <div style={{ color: "#a1a1aa", fontSize: 14, padding: "16px 0" }}>
              No clients yet.
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "separate",
                  borderSpacing: 0,
                  fontSize: 14,
                }}
              >
                <thead>
                  <tr>
                    <th style={thStyle}>Client</th>
                    {months.map((m) => (
                      <th
                        key={m.key}
                        style={{ ...thStyle, textAlign: "center" }}
                      >
                        {m.label.split(" ")[0]}
                      </th>
                    ))}
                    <th style={{ ...thStyle, textAlign: "center" }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {clients.map((client, idx) => {
                    const clientThemes = ideasData.themes.filter(
                      (t) => t.clientId === client.id
                    );
                    const clientIdeaIds = new Set(
                      ideasData.ideas
                        .filter((i) => i.clientId === client.id)
                        .map((i) => i.id)
                    );
                    const total = clientIdeaIds.size;

                    return (
                      <tr
                        key={client.id}
                        style={{
                          background: idx % 2 === 0 ? "#fff" : "#fafafa",
                        }}
                      >
                        <td style={tdStyle}>{client.name}</td>
                        {months.map((m, mIdx) => {
                          // Map calendar month index to theme month ranges
                          // mIdx 0-1 → themes with "1-2", mIdx 2-3 → "3-4", mIdx 4 → "5-6"
                          const pairIndex = Math.floor(mIdx / 2);
                          const pairLabel = `${pairIndex * 2 + 1}-${pairIndex * 2 + 2}`;
                          const matchingThemes = clientThemes.filter((t) =>
                            t.monthLabel.includes(pairLabel)
                          );
                          const count = matchingThemes.reduce(
                            (sum, t) =>
                              sum +
                              ideasData.ideas.filter((i) => i.themeId === t.id)
                                .length,
                            0
                          );
                          // Split evenly across the 2 months in a pair, show full on first
                          const display = mIdx % 2 === 0 ? count : 0;
                          return (
                            <td
                              key={m.key}
                              style={{ ...tdStyle, textAlign: "center" }}
                            >
                              {display > 0 ? (
                                <span style={badgeGreen}>{display}</span>
                              ) : (
                                <span style={{ color: "#d4d4d8" }}>0</span>
                              )}
                            </td>
                          );
                        })}
                        <td
                          style={{
                            ...tdStyle,
                            textAlign: "center",
                            fontWeight: 600,
                            color: total > 0 ? "#18181b" : "#d4d4d8",
                          }}
                        >
                          {total}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="Carousel Ideas"
          action={
            <Link
              href="/app/carousel-ideas"
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: "#18181b",
                background: "#f4f4f5",
                padding: "6px 12px",
                borderRadius: 999,
                textDecoration: "none",
              }}
            >
              Manage Ideas
            </Link>
          }
        >
          {clients.length === 0 ? (
            <div style={{ color: "#a1a1aa", fontSize: 14, padding: "16px 0" }}>
              No clients yet.
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "separate",
                  borderSpacing: 0,
                  fontSize: 14,
                }}
              >
                <thead>
                  <tr>
                    <th style={thStyle}>Client</th>
                    {months.map((m) => (
                      <th
                        key={m.key}
                        style={{ ...thStyle, textAlign: "center" }}
                      >
                        {m.label.split(" ")[0]}
                      </th>
                    ))}
                    <th style={{ ...thStyle, textAlign: "center" }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {clients.map((client, idx) => {
                    const clientThemes = carouselData.themes.filter(
                      (t) => t.clientId === client.id
                    );
                    const clientIdeaIds = new Set(
                      carouselData.ideas
                        .filter((i) => i.clientId === client.id)
                        .map((i) => i.id)
                    );
                    const total = clientIdeaIds.size;

                    return (
                      <tr
                        key={client.id}
                        style={{
                          background: idx % 2 === 0 ? "#fff" : "#fafafa",
                        }}
                      >
                        <td style={tdStyle}>{client.name}</td>
                        {months.map((m, mIdx) => {
                          const pairIndex = Math.floor(mIdx / 2);
                          const pairLabel = `${pairIndex * 2 + 1}-${pairIndex * 2 + 2}`;
                          const matchingThemes = clientThemes.filter((t) =>
                            t.monthLabel.includes(pairLabel)
                          );
                          const count = matchingThemes.reduce(
                            (sum, t) =>
                              sum +
                              carouselData.ideas.filter((i) => i.themeId === t.id)
                                .length,
                            0
                          );
                          const display = mIdx % 2 === 0 ? count : 0;
                          return (
                            <td
                              key={m.key}
                              style={{ ...tdStyle, textAlign: "center" }}
                            >
                              {display > 0 ? (
                                <span style={badgeBlue}>{display}</span>
                              ) : (
                                <span style={{ color: "#d4d4d8" }}>0</span>
                              )}
                            </td>
                          );
                        })}
                        <td
                          style={{
                            ...tdStyle,
                            textAlign: "center",
                            fontWeight: 600,
                            color: total > 0 ? "#18181b" : "#d4d4d8",
                          }}
                        >
                          {total}
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

const badgeGreen: React.CSSProperties = {
  display: "inline-block",
  minWidth: 26,
  padding: "2px 8px",
  borderRadius: 999,
  fontSize: 13,
  fontWeight: 600,
  background: "#dcfce7",
  color: "#166534",
};

const badgeBlue: React.CSSProperties = {
  display: "inline-block",
  minWidth: 26,
  padding: "2px 8px",
  borderRadius: 999,
  fontSize: 13,
  fontWeight: 600,
  background: "#dbeafe",
  color: "#1e40af",
};

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
