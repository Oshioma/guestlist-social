import { createClient } from "@/lib/supabase/server";
import InteractionsPanel from "./InteractionsPanel";

export const dynamic = "force-dynamic";

export default async function InteractionsPage() {
  const supabase = await createClient();
  const { data: clients } = await supabase
    .from("clients")
    .select("id, name, ig_handle")
    .eq("archived", false)
    .order("name", { ascending: true });

  const normalized = (clients ?? []).map((c) => ({
    id: String(c.id),
    name: String(c.name),
    igHandle: String(c.ig_handle ?? ""),
  }));

  return (
    <div style={{ maxWidth: 860, margin: "0 auto", padding: "24px 20px" }}>
      <InteractionsPanel clients={normalized} />
    </div>
  );
}
