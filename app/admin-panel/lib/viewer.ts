// ---------------------------------------------------------------------------
// Viewer resolution.
//
// Every page that needs to know "who is looking at this and what are they
// allowed to see" goes through getViewer(). It looks up the current Supabase
// auth user, then decides admission:
//   - a user_roles row              → admin-panel (agency staff) user
//   - else a team account           → client user, scoped to that account
//   - neither                       → NOT admitted (null)
//
// Client scoping is team-based: a client is a member of one or more teams
// (team_members), and each team holds a set of accounts (team_accounts). The
// client's account id is the first account across their teams — which, for
// an isolated client team, is simply their one account. This replaces the
// older client_user_links lookup; the 20260808 backfill migrated every
// portal client into an isolated team, so existing clients resolve
// identically.
//
// Staff take precedence: a user_roles row means agency staff (admin), even
// if they also belong to teams that contain accounts (staff belong to the
// "Guestlist Social" team, which holds every account). Keeping staff keyed on
// user_roles means the existing member-invite flow needs no change.
//
// Admission is deny-by-default: an authenticated account with no user_roles
// row and no team account resolves to null. This is what keeps an account
// that slipped past sign-up (there is no public sign-up — admission is
// invite-only) from silently gaining access.
//
// Why server-side: viewer state must be authoritative (a client must not be
// able to flip themselves into admin from the browser), and every gate in
// the app — middleware redirects, query scoping, button gating — runs in
// server components.
// ---------------------------------------------------------------------------

import "server-only";
import { createClient } from "@/lib/supabase/server";

export type Viewer =
  | { role: "admin"; userId: string; email: string | null }
  | {
      role: "client";
      userId: string;
      email: string | null;
      clientId: number;
    };

export async function getViewer(): Promise<Viewer | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // Agency staff take precedence: an explicit user_roles row → admin panel.
  const { data: roleRow } = await supabase
    .from("user_roles")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (roleRow) {
    return { role: "admin", userId: user.id, email: user.email ?? null };
  }

  // Not staff — resolve the client account from team membership. RLS scopes
  // team_accounts to the caller's own teams, so this only ever returns
  // accounts the user is actually a member of.
  const { data: acct } = await supabase
    .from("team_accounts")
    .select("client_id")
    .order("client_id", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (acct) {
    return {
      role: "client",
      userId: user.id,
      email: user.email ?? null,
      clientId: (acct as { client_id: number }).client_id,
    };
  }

  // Neither staff nor a member of any team with an account → not admitted.
  return null;
}

// assertCanViewClient: defense-in-depth gate every portal page calls before
// pulling client-scoped data. Middleware should already have bounced any
// disallowed access, but keeping the check on the page makes the data
// scoping explicit and safe even if a route is added later that someone
// forgot to wire into middleware.
export function canViewClient(viewer: Viewer | null, clientId: number): boolean {
  if (!viewer) return false;
  if (viewer.role === "admin") return true;
  return viewer.clientId === clientId;
}
