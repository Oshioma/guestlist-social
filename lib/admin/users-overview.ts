import "server-only";

// ---------------------------------------------------------------------------
// Super-admin "Users" overview: every user of the product with their teams,
// accounts, and onboarding progress. This deliberately crosses tenant
// boundaries (that's the point — it's the owner's oversight view), so it is
// gated on isSuperAdmin and read entirely through the service-role client.
//
// This is the ONLY place the owner sees other tenants' accounts; the Proofer
// board itself is team-scoped and never shows them.
// ---------------------------------------------------------------------------

import { createAdminClient } from "@/lib/supabase/admin";
import { isSuperAdmin } from "@/lib/auth/permissions";
import { ONBOARDING_TOTAL_STEPS } from "@/lib/onboarding";

export type OverviewAccount = { id: string; name: string };
export type OverviewTeam = {
  id: string;
  name: string;
  role: string;
  plan: string;
  isOwner: boolean;
  accounts: OverviewAccount[];
};
export type UserOverviewRow = {
  id: string;
  email: string;
  joinedAt: string | null;
  isStaff: boolean;
  progressPct: number | null; // null for staff (onboarding doesn't apply)
  progressLabel: string;
  teamCount: number;
  accountCount: number;
  teams: OverviewTeam[];
};

export async function loadUsersOverview(): Promise<UserOverviewRow[]> {
  if (!(await isSuperAdmin())) return [];

  const admin = createAdminClient();

  // Auth users (email + join date) — the spine of the list.
  const { data: authList } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const users = authList?.users ?? [];

  const [rolesRes, teamsRes, membersRes, taRes, clientsRes, onbRes] =
    await Promise.all([
      admin.from("user_roles").select("user_id"),
      admin.from("teams").select("id, name, plan, owner_user_id"),
      admin.from("team_members").select("team_id, user_id, role"),
      admin.from("team_accounts").select("team_id, client_id"),
      admin.from("clients").select("id, name, archived"),
      admin
        .from("user_onboarding")
        .select(
          "user_id, onboarding_started, onboarding_step, onboarding_completed, onboarding_skipped"
        ),
    ]);

  const staff = new Set(
    (rolesRes.data ?? []).map((r) => String((r as { user_id: string }).user_id))
  );

  const teamById = new Map<
    string,
    { name: string; plan: string; ownerId: string }
  >();
  for (const t of (teamsRes.data ?? []) as {
    id: string;
    name: string | null;
    plan: string | null;
    owner_user_id: string | null;
  }[]) {
    teamById.set(String(t.id), {
      name: t.name ?? "Team",
      plan: t.plan ?? "free",
      ownerId: String(t.owner_user_id ?? ""),
    });
  }

  const clientName = new Map<string, string>();
  for (const c of (clientsRes.data ?? []) as {
    id: number | string;
    name: string | null;
    archived: boolean | null;
  }[]) {
    if (c.archived) continue;
    clientName.set(String(c.id), c.name ?? "Untitled account");
  }

  const accountsByTeam = new Map<string, string[]>();
  for (const ta of (taRes.data ?? []) as {
    team_id: string;
    client_id: number | string;
  }[]) {
    const list = accountsByTeam.get(String(ta.team_id)) ?? [];
    list.push(String(ta.client_id));
    accountsByTeam.set(String(ta.team_id), list);
  }

  const membershipsByUser = new Map<string, { teamId: string; role: string }[]>();
  for (const m of (membersRes.data ?? []) as {
    team_id: string;
    user_id: string;
    role: string;
  }[]) {
    const list = membershipsByUser.get(String(m.user_id)) ?? [];
    list.push({ teamId: String(m.team_id), role: m.role });
    membershipsByUser.set(String(m.user_id), list);
  }

  const onbByUser = new Map<
    string,
    { started: boolean; step: number; completed: boolean; skipped: boolean }
  >();
  for (const o of (onbRes.data ?? []) as {
    user_id: string;
    onboarding_started: boolean | null;
    onboarding_step: number | null;
    onboarding_completed: boolean | null;
    onboarding_skipped: boolean | null;
  }[]) {
    onbByUser.set(String(o.user_id), {
      started: Boolean(o.onboarding_started),
      step: Number(o.onboarding_step ?? 0),
      completed: Boolean(o.onboarding_completed),
      skipped: Boolean(o.onboarding_skipped),
    });
  }

  const rows: UserOverviewRow[] = users.map((u) => {
    const id = u.id;
    const isStaff = staff.has(id);
    const memberships = membershipsByUser.get(id) ?? [];

    const teams: OverviewTeam[] = memberships.map((m) => {
      const t = teamById.get(m.teamId);
      const accounts = (accountsByTeam.get(m.teamId) ?? [])
        .filter((cid) => clientName.has(cid))
        .map((cid) => ({ id: cid, name: clientName.get(cid)! }));
      return {
        id: m.teamId,
        name: t?.name ?? "Team",
        role: m.role,
        plan: t?.plan ?? "free",
        isOwner: t?.ownerId === id,
        accounts,
      };
    });

    const accountCount = new Set(
      teams.flatMap((t) => t.accounts.map((a) => a.id))
    ).size;

    let progressPct: number | null = null;
    let progressLabel = "";
    if (isStaff) {
      progressLabel = "Staff";
    } else {
      const o = onbByUser.get(id);
      if (o?.completed) {
        progressPct = 100;
        progressLabel = "Onboarded";
      } else if (o?.skipped) {
        progressPct = 100;
        progressLabel = "Skipped tour";
      } else if (o?.started) {
        progressPct = Math.min(
          99,
          Math.round((o.step / ONBOARDING_TOTAL_STEPS) * 100)
        );
        progressLabel = `Onboarding · step ${o.step}/${ONBOARDING_TOTAL_STEPS}`;
      } else {
        progressPct = 0;
        progressLabel = "Not started";
      }
    }

    return {
      id,
      email: u.email ?? "(no email)",
      joinedAt: u.created_at ?? null,
      isStaff,
      progressPct,
      progressLabel,
      teamCount: teams.length,
      accountCount,
      teams,
    };
  });

  // Newest first, so recent sign-ups / invitees surface at the top.
  rows.sort((a, b) => {
    const ta = a.joinedAt ? Date.parse(a.joinedAt) : 0;
    const tb = b.joinedAt ? Date.parse(b.joinedAt) : 0;
    return tb - ta;
  });

  return rows;
}
