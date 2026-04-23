import { createAdminClient } from "@/lib/supabase/admin";
import InteractionsPanel from "./InteractionsPanel";

export const dynamic = "force-dynamic";

export default async function InteractionsPage() {
  const db = createAdminClient();

  // Step 1: only clients with a connected Meta account
  const { data: accountRows } = await db
    .from("connected_meta_accounts")
    .select("client_id");

  const connectedIds = [...new Set((accountRows ?? []).map((r) => r.client_id))];

  if (connectedIds.length === 0) {
    return (
      <div style={{ maxWidth: 860, margin: "0 auto", padding: "24px 20px" }}>
        <InteractionsPanel clients={[]} />
      </div>
    );
  }

  // Step 2: fetch those clients (ig_handle may not exist — fallback gracefully)
  const { data: clients, error } = await db
    .from("clients")
    .select("id, name, ig_handle")
    .in("id", connectedIds)
    .neq("archived", true)
    .order("name", { ascending: true });

  let rows = clients;
  if (error) {
    const { data: fallback } = await db
      .from("clients")
      .select("id, name")
      .in("id", connectedIds)
      .neq("archived", true)
      .order("name", { ascending: true });
    rows = fallback;
  }

  const normalized = (rows ?? []).map((c) => ({
    id: String(c.id),
    name: String(c.name),
    igHandle: String((c as { ig_handle?: string | null }).ig_handle ?? ""),
  }));

  return (
    <div style={{ maxWidth: 860, margin: "0 auto", padding: "24px 20px" }}>
      <InteractionsPanel clients={normalized} />
    </div>
  );
}
