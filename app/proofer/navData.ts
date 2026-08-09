import { cookies } from "next/headers";
import {
  getProoferData,
  getProoferPillarPosts,
  getProoferOccupiedDates,
} from "../admin-panel/lib/queries";
import { getProoferBase } from "./base";
import { getProoferAccess, isSuperAdmin } from "@/lib/auth/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { viewerHasClientsFeature } from "@/lib/billing/team-billing";

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

// Whether to surface the agency-only "Clients" feature in the nav for the
// current viewer. Hidden for free/pro posters — they see it only as a bullet on
// the plan comparison. Agency teams (and agency staff) get the full section.
export async function getShowClients(): Promise<boolean> {
  const access = await getProoferAccess();
  if (!access) return false;
  return viewerHasClientsFeature(createAdminClient(), {
    userId: access.userId,
    isStaff: access.kind === "staff",
  });
}

// The account (client) this user last viewed on the Proofer board, persisted
// server-side so it survives across devices and across the two product domains
// (a browser cookie can't). Returns "" when unknown or if the prefs table isn't
// migrated yet — callers fall back to the cookie / first account.
export async function getLastProoferClientId(): Promise<string> {
  try {
    const access = await getProoferAccess();
    if (!access) return "";
    const supabase = await createClient();
    const { data } = await supabase
      .from("user_proofer_prefs")
      .select("last_client_id")
      .eq("user_id", access.userId)
      .maybeSingle();
    return data?.last_client_id ? String(data.last_client_id) : "";
  } catch {
    return "";
  }
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

// The union of account (client) ids across ALL teams the current user belongs
// to. This is the hard boundary of what the viewer may see on the board — even
// agency staff (who could technically SELECT every client via RLS) are scoped
// to their own teams here, so an independent invitee's account never leaks into
// the picker. Empty set → the caller should show no accounts (fail closed).
export async function getMyTeamClientIds(): Promise<Set<string>> {
  const teams = await getMyTeams();
  if (teams.length === 0) return new Set();
  const admin = createAdminClient();
  const { data } = await admin
    .from("team_accounts")
    .select("client_id")
    .in(
      "team_id",
      teams.map((t) => t.id)
    );
  return new Set((data ?? []).map((r) => String(r.client_id)));
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
  // Resolve the last account from the DURABLE server-side preference first — it's
  // the authoritative, per-user, cross-device/cross-domain source. The cookie is
  // only a fast fallback; preferring it caused a stale or wrong-host cookie
  // (postproofer.com vs www) to override the account you actually left on.
  const lastClient =
    (await getLastProoferClientId()) || cookieStore.get(COOKIE_NAME)?.value || "";

  // Hard tenant boundary: the accounts in teams the viewer belongs to. Even
  // agency staff are scoped to this on the board, so other tenants' accounts
  // never appear. An optional ?team= filter narrows WITHIN this set.
  const myClientIds = await getMyTeamClientIds();
  const teamId = spTeam ?? "";
  const teamClientIds = teamId ? new Set(await getTeamClientIds(teamId)) : null;
  // A client is visible if it's in one of my teams AND (no team filter, or in
  // the filtered team).
  const inScope = (id: string) =>
    myClientIds.has(id) && (!teamClientIds || teamClientIds.has(id));

  let clientId = spClient ?? "";
  if (clientId && !inScope(clientId)) clientId = "";
  if (!clientId && lastClient && inScope(lastClient)) clientId = lastClient;
  if (!clientId) {
    const { clients } = await getProoferData();
    const pool = clients.filter((c) => inScope(String(c.id)));
    clientId = pool[0]?.id ?? "";
  }

  const { clients: allClients, pillars } = await getProoferData(clientId, month);
  const clients = allClients.filter((c) => inScope(String(c.id)));
  const posts = clientId ? await getProoferPillarPosts(clientId) : [];
  const occupiedDates = clientId ? await getProoferOccupiedDates(clientId) : [];
  const { base, parentOrigin } = await getProoferBase();
  const teams = await getMyTeams();
  const superAdmin = await isSuperAdmin();
  const showClients = await getShowClients();

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
    showClients,
  };
}
