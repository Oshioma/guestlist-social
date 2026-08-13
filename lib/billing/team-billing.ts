import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  planConfig,
  maxVideoUploadBytes,
  MAX_VIDEO_BYTES_DEFAULT,
  type Plan,
} from "./plans";
import { createAdminClient } from "@/lib/supabase/admin";
import { getViewer } from "@/app/admin-panel/lib/viewer";

const PLAN_RANK: Record<Plan, number> = { free: 0, pro: 1, agency: 2 };

/** The most generous plan across a set of team ids (defaults to free). */
async function bestPlanForTeamIds(
  admin: SupabaseClient,
  teamIds: string[]
): Promise<Plan> {
  if (teamIds.length === 0) return "free";
  const { data: teams } = await admin
    .from("teams")
    .select("plan")
    .in("id", teamIds);
  let best: Plan = "free";
  for (const t of teams ?? []) {
    const raw = (t.plan as string) ?? "free";
    const p: Plan = raw in PLAN_RANK ? (raw as Plan) : "free";
    if (PLAN_RANK[p] > PLAN_RANK[best]) best = p;
  }
  return best;
}

/** The most generous plan across every team a user belongs to. */
export async function bestPlanForUser(
  admin: SupabaseClient,
  userId: string
): Promise<Plan> {
  const { data: memberships } = await admin
    .from("team_members")
    .select("team_id")
    .eq("user_id", userId);
  const ids = [...new Set((memberships ?? []).map((m) => String(m.team_id)))];
  return bestPlanForTeamIds(admin, ids);
}

/**
 * Max size (bytes) of a single video upload for the CURRENT viewer.
 *
 *  - Agency staff always get the Agency ceiling (they run the whole agency).
 *  - A team member / client gets the most generous plan across their teams.
 *  - No viewer resolved → the default (non-agency) ceiling.
 *
 * Self-contained (resolves the viewer itself) so pages can pass the result
 * straight into an upload board without threading identity through.
 */
export async function getViewerMaxVideoUploadBytes(): Promise<number> {
  const viewer = await getViewer();
  if (!viewer) return MAX_VIDEO_BYTES_DEFAULT;
  if (viewer.role === "admin") return maxVideoUploadBytes("agency");
  const admin = createAdminClient();
  return maxVideoUploadBytes(await bestPlanForUser(admin, viewer.userId));
}

// Server-side billing helpers that touch the database. Kept separate from the
// pure catalogue in ./plans.ts so client components can import plan data
// without pulling in service-role code.
//
// "Social media account" = one connected Instagram/Facebook profile, i.e. one
// row in `connected_meta_accounts`. Connecting a client via the Meta OAuth flow
// attaches up to two (one FB Page + its linked IG account). Limits are per team;
// because a client (account) can belong to several teams, the count is always
// scoped to a specific team's `team_accounts`.

/** The client (account) ids that belong to a team. */
export async function teamClientIds(
  admin: SupabaseClient,
  teamId: string
): Promise<number[]> {
  const { data } = await admin
    .from("team_accounts")
    .select("client_id")
    .eq("team_id", teamId);
  return (data ?? []).map((r) => Number(r.client_id));
}

/** How many connected social accounts a team currently has. */
export async function countTeamSocialAccounts(
  admin: SupabaseClient,
  teamId: string
): Promise<number> {
  const clientIds = await teamClientIds(admin, teamId);
  if (clientIds.length === 0) return 0;
  const { count } = await admin
    .from("connected_meta_accounts")
    .select("*", { count: "exact", head: true })
    .in("client_id", clientIds);
  return count ?? 0;
}

/**
 * Does this viewer get the agency-only "Clients" feature? The Clients section
 * (and its portal "Client view") is hidden everywhere outside the plan
 * comparison until a team is on a plan that unlocks it — currently only Agency.
 *
 *  - Agency staff always get it (they run the whole agency).
 *  - Otherwise the user must belong to at least one team whose plan unlocks
 *    clients (`planConfig(team.plan).clients`).
 *
 * Fails closed: no membership, or every team on a lesser plan → false.
 */
export async function viewerHasClientsFeature(
  admin: SupabaseClient,
  opts: { userId: string; isStaff: boolean }
): Promise<boolean> {
  if (opts.isStaff) return true;

  const { data: memberships } = await admin
    .from("team_members")
    .select("team_id")
    .eq("user_id", opts.userId);
  const ids = [...new Set((memberships ?? []).map((m) => String(m.team_id)))];
  if (ids.length === 0) return false;

  const { data: teams } = await admin
    .from("teams")
    .select("plan")
    .in("id", ids);
  return (teams ?? []).some((t) => planConfig(t.plan as string).clients);
}

export type SocialAccountGate = {
  allowed: boolean;
  /** null when allowed unconditionally (staff, or a reconnect). */
  reason: string | null;
  plan: Plan;
  used: number;
  limit: number;
};

/**
 * May this user connect (a new) social account for `clientId`?
 *
 *  - Agency staff bypass the limit entirely (they run the whole agency).
 *  - Reconnecting an account that already has at least one connected profile
 *    never grows the count, so it's always allowed.
 *  - Otherwise the connection must fit within at least one of the user's
 *    managed teams that contains the client: room = plan.socialAccounts - used.
 *
 * The most generous managed team is reported, so the caller can point the user
 * at an upgrade only when every one of their teams is genuinely full.
 */
export async function socialAccountConnectGate(
  admin: SupabaseClient,
  opts: { userId: string; isStaff: boolean; clientId: number }
): Promise<SocialAccountGate> {
  const { userId, isStaff, clientId } = opts;

  if (isStaff) {
    return { allowed: true, reason: null, plan: "agency", used: 0, limit: planConfig("agency").socialAccounts };
  }

  // A reconnect (the client already has connected profiles) can't increase the
  // team's total, so let it through regardless of plan.
  const { count: existingForClient } = await admin
    .from("connected_meta_accounts")
    .select("*", { count: "exact", head: true })
    .eq("client_id", clientId);
  if ((existingForClient ?? 0) > 0) {
    return { allowed: true, reason: null, plan: "free", used: 0, limit: 0 };
  }

  // Teams this user owns/admins that contain the client.
  const { data: managed } = await admin
    .from("team_members")
    .select("team_id")
    .eq("user_id", userId)
    .in("role", ["owner", "admin"]);
  const managedTeamIds = (managed ?? []).map((r) => String(r.team_id));

  const { data: containing } = managedTeamIds.length
    ? await admin
        .from("team_accounts")
        .select("team_id")
        .eq("client_id", clientId)
        .in("team_id", managedTeamIds)
    : { data: [] as { team_id: string }[] };
  const teamIds = [...new Set((containing ?? []).map((r) => String(r.team_id)))];

  if (teamIds.length === 0) {
    // Not a manager of any team holding this client — the connect route's own
    // permission check will also refuse, but fail closed here too.
    return {
      allowed: false,
      reason: "You can only connect accounts in a team you manage.",
      plan: "free",
      used: 0,
      limit: 0,
    };
  }

  const { data: teamRows } = await admin
    .from("teams")
    .select("id, plan")
    .in("id", teamIds);
  const planById = new Map(
    (teamRows ?? []).map((t) => [String(t.id), (t.plan as Plan) ?? "free"])
  );

  let best: SocialAccountGate = {
    allowed: false,
    reason: null,
    plan: "free",
    used: 0,
    limit: planConfig("free").socialAccounts,
  };
  let bestRoom = -Infinity;

  for (const teamId of teamIds) {
    const plan = planById.get(teamId) ?? "free";
    const limit = planConfig(plan).socialAccounts;
    const used = await countTeamSocialAccounts(admin, teamId);
    const room = limit - used;
    if (room > bestRoom) {
      bestRoom = room;
      best = { allowed: room > 0, reason: null, plan, used, limit };
    }
  }

  if (!best.allowed) {
    best.reason =
      `You've reached the ${planConfig(best.plan).name} plan limit of ` +
      `${best.limit} social accounts. Upgrade the team to connect more.`;
  }
  return best;
}
