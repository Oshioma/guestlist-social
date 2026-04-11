type Memory = {
  id: string | number;
  note: string;
  tag: string;
};

const tagColors: Record<string, { bg: string; text: string }> = {
  creative: { bg: "#f3e8ff", text: "#7c3aed" },
  process: { bg: "#dbeafe", text: "#2563eb" },
  deadline: { bg: "#fee2e2", text: "#dc2626" },
  budget: { bg: "#dcfce7", text: "#16a34a" },
  strategy: { bg: "#e0f2fe", text: "#0284c7" },
};

export default function ClientMemories({
  memories,
  clientName,
}: {
  memories: Memory[];
  clientName: string;
}) {
  if (memories.length === 0) return null;

  return (
    <div
      style={{
        border: "1px solid #e4e4e7",
        borderRadius: 14,
        padding: 16,
        background: "#fffbeb",
        borderColor: "#fde68a",
      }}
    >
      <div
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: "#92400e",
          marginBottom: 10,
        }}
      >
        Remember for {clientName}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {memories.map((mem) => {
          const colors = tagColors[mem.tag] ?? {
            bg: "#f4f4f5",
            text: "#52525b",
          };
          return (
            <div
              key={mem.id}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 8,
                fontSize: 13,
                color: "#3f3f46",
              }}
            >
              <span
                style={{
                  fontSize: 11,
                  padding: "1px 7px",
                  borderRadius: 999,
                  background: colors.bg,
                  color: colors.text,
                  textTransform: "capitalize",
                  flexShrink: 0,
                  marginTop: 1,
                }}
              >
                {mem.tag}
              </span>
              <span>{mem.note}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
