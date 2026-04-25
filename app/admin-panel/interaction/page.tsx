import { createClient } from "@supabase/supabase-js";
import InteractionEngineUI from "./InteractionEngineClient";
import { getInteractionDecisions } from "./actions";

export const dynamic = "force-dynamic";

export type IgAccount = {
  id: string;
  clientId: number | null;
  name: string;
  handle: string;
  tokenExpiresAt: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
};

export type SetupIssue =
  | { kind: "missing-supabase" }
  | { kind: "no-accounts" }
  | null;

async function getInstagramAccounts(): Promise<{
  accounts: IgAccount[];
  setupIssue: SetupIssue;
}> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return { accounts: [], setupIssue: { kind: "missing-supabase" } };

  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data, error } = await db
    .from("connected_meta_accounts")
    .select("account_id, client_id, account_name, token_expires_at, last_error, last_error_at")
    .eq("platform", "instagram")
    .order("account_name", { ascending: true });

  if (error) {
    console.error("[interaction/getInstagramAccounts] error:", error);
    return { accounts: [], setupIssue: null };
  }

  const seen = new Set<string>();
  const accounts: IgAccount[] = [];
  for (const row of data ?? []) {
    const id = String(row.account_id ?? "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const name = String(row.account_name ?? id).trim();
    const clientIdRaw = row.client_id;
    const clientId =
      typeof clientIdRaw === "number"
        ? clientIdRaw
        : typeof clientIdRaw === "string" && clientIdRaw.trim() !== ""
          ? Number(clientIdRaw)
          : null;
    accounts.push({
      id,
      clientId: clientId != null && Number.isFinite(clientId) ? clientId : null,
      name,
      handle: `@${name.replace(/^@/, "")}`,
      tokenExpiresAt: (row.token_expires_at as string | null) ?? null,
      lastError: (row.last_error as string | null) ?? null,
      lastErrorAt: (row.last_error_at as string | null) ?? null,
    });
  }

  const setupIssue: SetupIssue = accounts.length === 0 ? { kind: "no-accounts" } : null;
  return { accounts, setupIssue };
}

export default async function InteractionPage() {
  const { accounts, setupIssue } = await getInstagramAccounts();
  const firstId = accounts[0]?.id ?? "";
  const initialDecisions = firstId ? await getInteractionDecisions(firstId) : [];

  return (
    <InteractionEngineUI
      initialClients={accounts}
      initialDecisions={initialDecisions}
      setupIssue={setupIssue}
    />
  );
}
