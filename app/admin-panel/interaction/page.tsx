import { createClient } from "@supabase/supabase-js";
import InteractionEngineUI from "./InteractionEngineClient";

export const dynamic = "force-dynamic";

async function getClients() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return [];

  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  // Only return clients that have at least one connected Meta account
  const { data, error } = await db
    .from("clients")
    .select("id, name, ig_handle, connected_meta_accounts!inner(client_id)")
    .order("name", { ascending: true });

  if (error) {
    // Fallback: return all clients if the join or ig_handle column fails
    const fallback = await db
      .from("clients")
      .select("id, name")
      .order("name", { ascending: true });
    return (fallback.data ?? []).map((c) => ({
      id: String(c.id),
      name: String(c.name),
      handle: "",
    }));
  }

  return (data ?? []).map((c) => ({
    id: String(c.id),
    name: String(c.name),
    handle: c.ig_handle ? `@${String(c.ig_handle).replace(/^@/, "")}` : "",
  }));
}

export default async function InteractionPage() {
  const clients = await getClients();
  return <InteractionEngineUI initialClients={clients} />;
}
