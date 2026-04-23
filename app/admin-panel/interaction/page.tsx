import { createClient } from "@supabase/supabase-js";
import InteractionEngineUI from "./InteractionEngineClient";

export const dynamic = "force-dynamic";

async function getClients() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return [];

  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  // Step 1: get distinct client IDs that have connected Meta accounts
  const { data: accountRows } = await db
    .from("connected_meta_accounts")
    .select("client_id");

  const connectedIds = [...new Set((accountRows ?? []).map((r) => r.client_id))];
  if (connectedIds.length === 0) return [];

  // Step 2: fetch only those clients
  const { data } = await db
    .from("clients")
    .select("id, name, ig_handle")
    .in("id", connectedIds)
    .order("name", { ascending: true });

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
