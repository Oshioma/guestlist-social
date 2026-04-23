import { createClient } from "@supabase/supabase-js";
import InteractionEngineUI from "./InteractionEngineClient";

export const dynamic = "force-dynamic";

export type IgAccount = { id: string; name: string; handle: string };

async function getInstagramAccounts(): Promise<IgAccount[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return [];

  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data, error } = await db
    .from("connected_meta_accounts")
    .select("account_id, account_name")
    .eq("platform", "instagram")
    .order("account_name", { ascending: true });

  if (error) {
    console.error("[interaction/getInstagramAccounts] error:", error);
    return [];
  }

  const seen = new Set<string>();
  const accounts: IgAccount[] = [];
  for (const row of data ?? []) {
    const id = String(row.account_id ?? "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const name = String(row.account_name ?? id).trim();
    accounts.push({ id, name, handle: `@${name.replace(/^@/, "")}` });
  }

  console.log("[interaction/getInstagramAccounts] found:", accounts.map((a) => a.handle));
  return accounts;
}

export default async function InteractionPage() {
  const accounts = await getInstagramAccounts();
  return <InteractionEngineUI initialClients={accounts} />;
}
