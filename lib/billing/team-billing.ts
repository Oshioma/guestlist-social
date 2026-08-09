import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { planConfig, type Plan } from "./plans";

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
