"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSuperAdmin, superAdminEmails } from "@/lib/auth/permissions";

// ---------------------------------------------------------------------------
// Super-admin: permanently delete a user and everything they created. Built for
// clearing out test accounts, so it's a HARD delete with a full cascade:
//   - the auth user,
//   - their per-user rows (roles, memberships, portal links, onboarding),
//   - the teams they OWN (+ memberships/account links in them),
//   - the accounts (clients) that live ONLY in those owned teams, and all the
//     board data under them (posts, queue, comments, pillars, ideas, connected
//     Meta accounts).
// An account shared into another (non-owned) team is left alone — only the
// team link is removed — so we never nuke someone else's live account.
// ---------------------------------------------------------------------------

type Result =
  | { ok: true; message: string }
  | { ok: false; error: string };

export async function deleteUserFullyAction(userId: string): Promise<Result> {
  if (!(await isSuperAdmin())) return { ok: false, error: "Not authorized." };

  const id = String(userId ?? "").trim();
  if (!id) return { ok: false, error: "No user specified." };

  // Never delete yourself or another super admin.
  const supabase = await createClient();
  const {
    data: { user: me },
  } = await supabase.auth.getUser();
  if (me?.id === id) return { ok: false, error: "You can't delete your own account here." };

  const admin = createAdminClient();

  const { data: target } = await admin.auth.admin.getUserById(id);
  const email = (target?.user?.email ?? "").toLowerCase();
  if (!target?.user) return { ok: false, error: "That user no longer exists." };
  if (email && superAdminEmails().includes(email)) {
    return { ok: false, error: "That account is a super admin and can't be deleted here." };
  }

  try {
    // 1) Teams this user owns.
    const { data: ownedTeams } = await admin
      .from("teams")
      .select("id")
      .eq("owner_user_id", id);
    const ownedTeamIds = (ownedTeams ?? []).map((t) => String(t.id));

    // 2) Accounts that live ONLY in those owned teams (safe to delete).
    let clientsToDelete: string[] = [];
    if (ownedTeamIds.length > 0) {
      const { data: ownedLinks } = await admin
        .from("team_accounts")
        .select("client_id")
        .in("team_id", ownedTeamIds);
      const candidates = Array.from(
        new Set((ownedLinks ?? []).map((r) => String(r.client_id)))
      );
      if (candidates.length > 0) {
        const { data: allLinks } = await admin
          .from("team_accounts")
          .select("client_id, team_id")
          .in("client_id", candidates);
        const sharedElsewhere = new Set(
          (allLinks ?? [])
            .filter((r) => !ownedTeamIds.includes(String(r.team_id)))
            .map((r) => String(r.client_id))
        );
        clientsToDelete = candidates.filter((cid) => !sharedElsewhere.has(cid));
      }
    }

    let accountsRemoved = 0;
    let postsRemoved = 0;

    // 3) Board data for the accounts we're deleting.
    if (clientsToDelete.length > 0) {
      const { data: posts } = await admin
        .from("proofer_posts")
        .select("id")
        .in("client_id", clientsToDelete);
      const postIds = (posts ?? []).map((p) => String(p.id));
      postsRemoved = postIds.length;
      if (postIds.length > 0) {
        await admin.from("proofer_publish_queue").delete().in("post_id", postIds);
        await admin.from("proofer_comments").delete().in("post_id", postIds);
      }
      await admin.from("proofer_posts").delete().in("client_id", clientsToDelete);
      await admin.from("post_ideas").delete().in("client_id", clientsToDelete);
      await admin.from("content_pillars").delete().in("client_id", clientsToDelete);
      await admin.from("connected_meta_accounts").delete().in("client_id", clientsToDelete);
      await admin.from("client_user_links").delete().in("client_id", clientsToDelete);
    }

    // 4) Owned teams: their account links, memberships, then the teams.
    if (ownedTeamIds.length > 0) {
      await admin.from("team_accounts").delete().in("team_id", ownedTeamIds);
      await admin.from("team_members").delete().in("team_id", ownedTeamIds);
      await admin.from("teams").delete().in("id", ownedTeamIds);
    }

    // 5) The account rows themselves.
    let accountsError: string | null = null;
    if (clientsToDelete.length > 0) {
      const { error } = await admin.from("clients").delete().in("id", clientsToDelete);
      if (error) accountsError = error.message;
      else accountsRemoved = clientsToDelete.length;
    }

    // 6) This user's remaining per-user rows (memberships in others' teams,
    //    roles, portal links, onboarding state).
    await admin.from("team_members").delete().eq("user_id", id);
    await admin.from("user_roles").delete().eq("user_id", id);
    await admin.from("client_user_links").delete().eq("auth_user_id", id);
    await admin.from("user_onboarding").delete().eq("user_id", id);
    await admin.from("onboarding_events").delete().eq("user_id", id);

    // 7) Finally the auth user.
    const { error: authErr } = await admin.auth.admin.deleteUser(id);
    if (authErr) {
      return { ok: false, error: `Cleaned up their data, but deleting the login failed: ${authErr.message}` };
    }

    const parts = [
      `Deleted ${email || "user"}`,
      `${ownedTeamIds.length} team(s)`,
      `${accountsRemoved} account(s)`,
      `${postsRemoved} post(s)`,
    ];
    const msg = parts.join(" · ") + (accountsError ? ` (some account rows had other linked data: ${accountsError})` : "");
    return { ok: true, message: msg };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Delete failed." };
  }
}
