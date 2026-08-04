import Link from "next/link";

export type TeamPriorityRow = {
  assignee: string;
  title: string;
  taskId: string;
  dueDate: string | null;
  createdAt: string;
};

export type TeamPriorityStats = {
  rows: TeamPriorityRow[];
};

// Turn an assignee string (usually an email) into a friendlier display name:
// "oshi@guestlist.net" -> "Oshi". Falls back to the raw value if it isn't an
// email-shaped string.
function displayName(assignee: string): string {
  const local = assignee.includes("@") ? assignee.split("@")[0] : assignee;
  const cleaned = local.replace(/[._-]+/g, " ").trim();
  if (!cleaned) return assignee;
  return cleaned
    .split(" ")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

function formatDate(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// Whether a due date is before today (local calendar day).
function isOverdue(dueDate: string | null): boolean {
  if (!dueDate) return false;
  const d = new Date(dueDate);
  if (Number.isNaN(d.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return d < today;
}

export default function TeamPriorityCard({ stats }: { stats: TeamPriorityStats }) {
  const { rows } = stats;

  return (
    <div
      style={{
        borderRadius: 14,
        background: "#fff",
        border: "1px solid #e4e4e7",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 12,
          padding: "16px 18px",
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 700, color: "#18181b" }}>
          High-priority per person
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
          <div style={{ fontSize: 11, color: "#a1a1aa" }}>
            latest, assigned in last 3 weeks
          </div>
          <Link
            href="/app/tasks"
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: "#7c3aed",
              textDecoration: "none",
              whiteSpace: "nowrap",
            }}
          >
            View tasks →
          </Link>
        </div>
      </div>

      {rows.length === 0 ? (
        <div style={{ padding: "0 18px 16px", fontSize: 13, color: "#a1a1aa" }}>
          No high-priority tasks assigned in the last 3 weeks.
        </div>
      ) : (
        <div style={{ borderTop: "1px solid #f4f4f5" }}>
          {rows.map((row) => {
            const overdue = isOverdue(row.dueDate);
            return (
              <Link
                key={row.assignee}
                href="/app/tasks"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  padding: "12px 18px",
                  borderTop: "1px solid #f4f4f5",
                  textDecoration: "none",
                  color: "inherit",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: "#18181b",
                      marginBottom: 2,
                    }}
                  >
                    {displayName(row.assignee)}
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      color: "#3f3f46",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    <span
                      style={{
                        display: "inline-block",
                        fontSize: 10,
                        fontWeight: 700,
                        color: "#b91c1c",
                        background: "#fee2e2",
                        border: "1px solid #fecaca",
                        borderRadius: 6,
                        padding: "1px 6px",
                        marginRight: 8,
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                        verticalAlign: "middle",
                      }}
                    >
                      High
                    </span>
                    {row.title || "Untitled task"}
                  </div>
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: overdue ? "#b91c1c" : "#a1a1aa",
                    fontWeight: overdue ? 600 : 400,
                    whiteSpace: "nowrap",
                  }}
                >
                  {row.dueDate
                    ? `${overdue ? "Overdue · " : "Due "}${formatDate(row.dueDate)}`
                    : "No due date"}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
