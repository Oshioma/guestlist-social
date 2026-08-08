import { cookies } from "next/headers";
import {
  getProoferData,
  getProoferPillarPosts,
  getProoferOccupiedDates,
} from "../admin-panel/lib/queries";
import { getProoferBase } from "./base";
import { getProoferAccess, isSuperAdmin } from "@/lib/auth/permissions";
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

// The client ids (accounts) that belong to a team, via the team_accounts link.
// Read with the admin client so the filter works for any team the user can see
// in the nav; the caller only ever intersects this with clients the viewer is
// already allowed to load, so it never widens visibility.
export async function getTeamClientIds(teamId: string): Promise<string[]> {
  if (!teamId) return [];
  const admin = createAdminClient();
  const { data } = await admin
    .from("team_accounts")
    .select("client_id")
    .eq("team_id", teamId);
  return (data ?? []).map((r) => String(r.client_id));
}

// Resolves everything the standalone top nav needs (client list, selected
// client/month, pillars and their posts) so every /proofer page can render the
// same nav consistently.
export async function resolveNavData(
  spClient?: string,
  spMonth?: string,
  spTeam?: string
) {
  const month = spMonth ?? currentMonthValue();

  const cookieStore = await cookies();
  const lastClient = cookieStore.get(COOKIE_NAME)?.value ?? "";

  // Optional team filter: when set, the account picker only shows that team's
  // accounts and the selected client is resolved within them.
  const teamId = spTeam ?? "";
  const teamClientIds = teamId ? new Set(await getTeamClientIds(teamId)) : null;
  const inTeam = (id: string) => !teamClientIds || teamClientIds.has(id);

  let clientId = spClient ?? "";
  if (clientId && !inTeam(clientId)) clientId = "";
  if (!clientId && lastClient && inTeam(lastClient)) clientId = lastClient;
  if (!clientId) {
    const { clients } = await getProoferData();
    const pool = teamClientIds
      ? clients.filter((c) => teamClientIds.has(String(c.id)))
      : clients;
    clientId = pool[0]?.id ?? "";
  }

  const { clients: allClients, pillars } = await getProoferData(clientId, month);
  const clients = teamClientIds
    ? allClients.filter((c) => teamClientIds.has(String(c.id)))
    : allClients;
  const posts = clientId ? await getProoferPillarPosts(clientId) : [];
  const occupiedDates = clientId ? await getProoferOccupiedDates(clientId) : [];
  const { base, parentOrigin } = await getProoferBase();
  const teams = await getMyTeams();
  const superAdmin = await isSuperAdmin();

  return {
    clientId,
    month,
    teamId,
    clients,
    pillars,
    posts,
    occupiedDates,
    base,
    parentOrigin,
    teams,
    superAdmin,
  };
}
