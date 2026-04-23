import { createClient } from "@/lib/supabase/server";
import { createMemory, deleteMemory } from "@/app/admin-panel/lib/memory-actions";
import SectionCard from "@/app/admin-panel/components/SectionCard";
import MemoryForm from "@/app/admin-panel/components/MemoryForm";
import DeleteMemoryButton from "@/app/admin-panel/components/DeleteMemoryButton";
import { formatDate } from "@/app/admin-panel/lib/utils";

export const dynamic = "force-dynamic";

export default async function MemoryPage() {
  const supabase = await createClient();

  const [{ data: clientRows }, { data: memoryRows }] = await Promise.all([
    supabase.from("clients").select("id, name").order("name", { ascending: true }),
    supabase
      .from("memories")
      .select("*, clients(name)")
      .order("created_at", { ascending: false }),
  ]);

  const clients = (clientRows ?? []).map((c) => ({
    id: String(c.id),
    name: String(c.name),
  }));

  const memories = memoryRows ?? [];

  // Group by client name
  const grouped: Record<string, typeof memories> = {};
  for (const mem of memories) {
    const clientName =
      (mem.clients as { name: string } | null)?.name ?? "Unknown";
    if (!grouped[clientName]) grouped[clientName] = [];
    grouped[clientName].push(mem);
  }

  const sortedGroups = Object.entries(grouped).sort(([a], [b]) =>
    a.localeCompare(b)
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div>
        <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Memory</h2>
        <p style={{ fontSize: 14, color: "#71717a", margin: "4px 0 0" }}>
          Client notes, preferences and things to remember. Saved to your
          database.
        </p>
      </div>

      <MemoryForm clients={clients} onSubmit={createMemory} />

      {sortedGroups.length > 0 ? (
        sortedGroups.map(([clientName, entries]) => (
          <SectionCard key={clientName} title={clientName}>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {entries.map((entry) => {
                const memoryId = String(entry.id);

                async function handleDelete() {
                  "use server";
                  await deleteMemory(memoryId);
                }

                return (
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
                        justifyContent: "space-between",
                        gap: 8,
                        marginBottom: 6,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
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
                          {entry.created_at
                            ? formatDate(entry.created_at)
                            : ""}
                        </span>
                      </div>

                      <DeleteMemoryButton onDelete={handleDelete} />
                    </div>
                    <p style={{ fontSize: 14, margin: 0, color: "#3f3f46" }}>
                      {entry.note}
                    </p>
                  </div>
                );
              })}
            </div>
          </SectionCard>
        ))
      ) : (
        <SectionCard title="No memories yet">
          <p style={{ fontSize: 14, color: "#71717a", margin: 0 }}>
            Add your first memory above — client preferences, deadlines,
            creative notes, anything worth remembering.
          </p>
        </SectionCard>
      )}
    </div>
  );
}
