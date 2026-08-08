import { cookies } from "next/headers";
import {
  getProoferData,
  getProoferPillarPosts,
} from "../admin-panel/lib/queries";
import { getProoferBase } from "./base";
import { getProoferAccess } from "@/lib/auth/permissions";
import { createAdminClient } from "@/lib/supabase/admin";

const COOKIE_NAME = "proofer_last_client";

export type NavTeam = { id: string; name: string; isOwner: boolean };

// The teams the current user belongs to, for the nav switcher. Owned team(s)
// first, then alphabetical. Empty for a signed-out or team-less user.
export async function getMyTeams(): Promise<NavTeam[]> {
  const access = await getProoferAccess();
  if (!access) return [];

  const admin = createAdminClient();
  const { data: memberships } = await admin
    .from("team_members")
    .select("team_id")
    .eq("user_id", access.userId);
  const ids = Array.from(new Set((memberships ?? []).map((m) => m.team_id as string)));
  if (ids.length === 0) return [];

  const { data: teams } = await admin
    .from("teams")
    .select("id, name, owner_user_id")
    .in("id", ids);

  return (teams ?? [])
    .map((t) => ({
      id: t.id as string,
      name: (t.name as string) ?? "Team",
      isOwner: t.owner_user_id === access.userId,
    }))
    .sort((a, b) =>
      a.isOwner === b.isOwner ? a.name.localeCompare(b.name) : a.isOwner ? -1 : 1
    );
}

export function currentMonthValue(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

// Resolves everything the standalone top nav needs (client list, selected
// client/month, pillars and their posts) so every /proofer page can render the
// same nav consistently.
export async function resolveNavData(spClient?: string, spMonth?: string) {
  const month = spMonth ?? currentMonthValue();

  const cookieStore = await cookies();
  const lastClient = cookieStore.get(COOKIE_NAME)?.value ?? "";

  let clientId = spClient ?? "";
  if (!clientId && lastClient) clientId = lastClient;
  if (!clientId) {
    const { clients } = await getProoferData();
    clientId = clients[0]?.id ?? "";
  }

  const { clients, pillars } = await getProoferData(clientId, month);
  const posts = clientId ? await getProoferPillarPosts(clientId) : [];
  const { base, parentOrigin } = await getProoferBase();
  const teams = await getMyTeams();

  return { clientId, month, clients, pillars, posts, base, parentOrigin, teams };
}
