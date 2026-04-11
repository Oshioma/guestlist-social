import { memoryEntries } from "../lib/data";
import SectionCard from "../components/SectionCard";
import { formatDate } from "../lib/utils";

export default function MemoryPage() {
  const grouped = memoryEntries.reduce(
    (acc, entry) => {
      if (!acc[entry.clientName]) acc[entry.clientName] = [];
      acc[entry.clientName].push(entry);
      return acc;
    },
    {} as Record<string, typeof memoryEntries>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div>
        <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Memory</h2>
        <p style={{ fontSize: 14, color: "#71717a", margin: "4px 0 0" }}>
          Client notes, preferences and things to remember.
        </p>
      </div>

      {Object.entries(grouped).map(([clientName, entries]) => (
        <SectionCard key={clientName} title={clientName}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {entries.map((entry) => (
              <div
                key={entry.id}
                style={{
                  padding: 12,
                  borderRadius: 8,
                  background: "#fafafa",
                  border: "1px solid #f4f4f5",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 6,
                  }}
                >
                  <span
                    style={{
                      fontSize: 11,
                      padding: "1px 8px",
                      borderRadius: 999,
                      background: "#e4e4e7",
                      color: "#52525b",
                      textTransform: "capitalize",
                    }}
                  >
                    {entry.tag}
                  </span>
                  <span style={{ fontSize: 12, color: "#a1a1aa" }}>
                    {formatDate(entry.createdAt)}
                  </span>
                </div>
                <p style={{ fontSize: 14, margin: 0, color: "#3f3f46" }}>
                  {entry.note}
                </p>
              </div>
            ))}
          </div>
        </SectionCard>
      ))}
    </div>
  );
}
