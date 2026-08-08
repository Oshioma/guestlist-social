"use server";

// Service-role actions for the teams management surface. Every action calls
// requireAdmin() first, so only agency staff (a user_roles row) can create or
// mutate teams, membership, or account assignments — even if a non-admin
// reaches the URL. This mirrors member-actions.ts.
//
// Model recap (see supabase/migrations/20260808_teams.sql):
//   teams          — a workspace: name, owner, plan (free|pro)
//   team_members   — (team, user, role) role ∈ owner|admin|member|client
//   team_accounts  — (team, client) many-to-many; an account can be in
//                    several teams (e.g. Guestlist Social AND a client's own
//                    isolated team), which is what lets a client see their
//                    content and nothing else.
//
// Invite gating: inviting a *collaborator* (admin/member) requires the team
// to be on the Pro plan — "pro members can invite people to their teams".
// Inviting a *client* (a read/approve viewer) is always allowed, because
// giving a client sight of their own content is core, not an upsell.

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/permissions";

export type ActionState = {
  error?: string | null;
  fieldErrors?: Partial<Record<string, string[]>>;
  success?: boolean;
  message?: string;
};

function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}

function revalidateTeams(teamId?: string) {
  revalidatePath("/app/settings/teams");
  if (teamId) revalidatePath(`/app/settings/teams/${teamId}`);
}

// Find an existing auth user by email, or send them an invite. Returns the
// user id either way so the caller can attach a membership. Handles the
// "already registered" case so re-inviting or adding an existing client works.
async function resolveOrInviteUser(
  admin: ReturnType<typeof createAdminClient>,
  email: string
): Promise<{ userId?: string; invited?: boolean; error?: string }> {
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${siteUrl()}/auth/callback?type=invite`,
  });

  if (!error && data?.user) {
    return { userId: data.user.id, invited: true };
  }

  // Invite failed — most commonly because the account already exists. Look it
  // up and reuse it rather than surfacing an error.
  const { data: list } = await admin.auth.admin.listUsers({ perPage: 200 });
  const existing = list?.users?.find(
    (u) => (u.email ?? "").toLowerCase() === email.toLowerCase()
  );
  if (existing) return { userId: existing.id, invited: false };

  return { error: error?.message ?? "Could not invite that email." };
}

// ── Create / rename / plan / delete ────────────────────────────────────────

const createSchema = z.object({
  name: z.string().trim().min(1, "Give the team a name.").max(120),
  plan: z.enum(["free", "pro"]).default("free"),
});

export async function createTeam(
  _prev: ActionState | null,
  formData: FormData
): Promise<ActionState> {
  const actor = await requireAdmin();

  const parsed = createSchema.safeParse({
    name: formData.get("name"),
    plan: formData.get("plan") ?? "free",
  });
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const admin = createAdminClient();

  const { data: team, error } = await admin
    .from("teams")
    .insert({ name: parsed.data.name, owner_user_id: actor.userId, plan: parsed.data.plan })
    .select("id")
    .single();

  if (error || !team) {
    return { error: error?.message ?? "Could not create the team." };
  }

  // The creator is the owner.
  const { error: memberErr } = await admin
    .from("team_members")
    .insert({ team_id: team.id, user_id: actor.userId, role: "owner" });

  if (memberErr) {
    return { error: `Team created, but owner could not be set: ${memberErr.message}` };
  }

  revalidateTeams(team.id);
  return { success: true, message: `Team "${parsed.data.name}" created.` };
}

const renameSchema = z.object({
  teamId: z.string().uuid(),
  name: z.string().trim().min(1, "Name can't be empty.").max(120),
});

export async function renameTeam(
  _prev: ActionState | null,
  formData: FormData
): Promise<ActionState> {
  await requireAdmin();

  const parsed = renameSchema.safeParse({
    teamId: formData.get("teamId"),
    name: formData.get("name"),
  });
  if (!parsed.success) return { error: "Invalid form data." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("teams")
    .update({ name: parsed.data.name })
    .eq("id", parsed.data.teamId);

  if (error) return { error: error.message };

  revalidateTeams(parsed.data.teamId);
  return { success: true, message: "Team renamed." };
}

const planSchema = z.object({
  teamId: z.string().uuid(),
  plan: z.enum(["free", "pro"]),
});

export async function setTeamPlan(
  _prev: ActionState | null,
  formData: FormData
): Promise<ActionState> {
  await requireAdmin();

  const parsed = planSchema.safeParse({
    teamId: formData.get("teamId"),
    plan: formData.get("plan"),
  });
  if (!parsed.success) return { error: "Invalid form data." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("teams")
    .update({ plan: parsed.data.plan })
    .eq("id", parsed.data.teamId);

  if (error) return { error: error.message };

  revalidateTeams(parsed.data.teamId);
  return {
    success: true,
    message: parsed.data.plan === "pro" ? "Upgraded to Pro." : "Switched to Free.",
  };
}

const deleteSchema = z.object({ teamId: z.string().uuid() });

export async function deleteTeam(
  _prev: ActionState | null,
  formData: FormData
): Promise<ActionState> {
  await requireAdmin();

  const parsed = deleteSchema.safeParse({ teamId: formData.get("teamId") });
  if (!parsed.success) return { error: "Invalid form data." };

  const admin = createAdminClient();

  // Guard against accidental catastrophic deletes: a team must be emptied of
  // accounts and of everyone but its owner before it can go. Deleting still
  // cascades team_members/team_accounts, but this forces a deliberate cleanup
  // first so nobody silently loses access to an account they were relying on.
  const [{ count: accountCount }, { count: memberCount }] = await Promise.all([
    admin.from("team_accounts").select("*", { count: "exact", head: true }).eq("team_id", parsed.data.teamId),
    admin.from("team_members").select("*", { count: "exact", head: true }).eq("team_id", parsed.data.teamId),
  ]);

  if ((accountCount ?? 0) > 0) {
    return { error: "Remove all accounts from this team before deleting it." };
  }
  if ((memberCount ?? 0) > 1) {
    return { error: "Remove all members except the owner before deleting it." };
  }

  const { error } = await admin.from("teams").delete().eq("id", parsed.data.teamId);
  if (error) return { error: error.message };

  revalidatePath("/app/settings/teams");
  return { success: true, message: "Team deleted." };
}

// ── Membership ──────────────────────────────────────────────────────────────

const inviteSchema = z.object({
  teamId: z.string().uuid(),
  email: z.string().email("Enter a valid email address."),
  role: z.enum(["admin", "member", "client"]),
});

export async function inviteToTeam(
  _prev: ActionState | null,
  formData: FormData
): Promise<ActionState> {
  await requireAdmin();

  const parsed = inviteSchema.safeParse({
    teamId: formData.get("teamId"),
    email: formData.get("email"),
    role: formData.get("role"),
  });
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const { teamId, email, role } = parsed.data;
  const admin = createAdminClient();

  // Pro gate: collaborators (member/admin) need a Pro team — "pro members can
  // invite people to their teams". Clients are always allowed, since giving a
  // client sight of their own content is core, not an upsell.
  if (role === "admin" || role === "member") {
    const { data: team } = await admin
      .from("teams")
      .select("plan")
      .eq("id", teamId)
      .maybeSingle();
    if ((team?.plan ?? "free") !== "pro") {
      return { error: "Upgrade this team to Pro to invite admins or members." };
    }
  }

  const resolved = await resolveOrInviteUser(admin, email);
  if (resolved.error || !resolved.userId) {
    return { error: resolved.error ?? "Could not resolve that email." };
  }

  const { error } = await admin
    .from("team_members")
    .upsert(
      { team_id: teamId, user_id: resolved.userId, role },
      { onConflict: "team_id,user_id" }
    );

  if (error) return { error: `Could not add them to the team: ${error.message}` };

  revalidateTeams(teamId);
  return {
    success: true,
    message: resolved.invited
      ? `Invite sent to ${email}.`
      : `${email} added to the team.`,
  };
}

const roleSchema = z.object({
  teamId: z.string().uuid(),
  userId: z.string().uuid(),
  role: z.enum(["admin", "member", "client"]),
});

export async function updateTeamMemberRole(
  _prev: ActionState | null,
  formData: FormData
): Promise<ActionState> {
  await requireAdmin();

  const parsed = roleSchema.safeParse({
    teamId: formData.get("teamId"),
    userId: formData.get("userId"),
    role: formData.get("role"),
  });
  if (!parsed.success) return { error: "Invalid form data." };

  const admin = createAdminClient();

  // The owner's role is immutable here — ownership transfer is a separate,
  // deliberate action we haven't built yet.
  const { data: team } = await admin
    .from("teams")
    .select("owner_user_id, plan")
    .eq("id", parsed.data.teamId)
    .maybeSingle();
  if (team?.owner_user_id === parsed.data.userId) {
    return { error: "The team owner's role can't be changed here." };
  }

  // Same Pro gate as invites: promoting someone to a collaborator role needs
  // a Pro team.
  if (
    (parsed.data.role === "admin" || parsed.data.role === "member") &&
    (team?.plan ?? "free") !== "pro"
  ) {
    return { error: "Upgrade this team to Pro to assign admin or member roles." };
  }

  const { error } = await admin
    .from("team_members")
    .update({ role: parsed.data.role })
    .eq("team_id", parsed.data.teamId)
    .eq("user_id", parsed.data.userId);

  if (error) return { error: error.message };

  revalidateTeams(parsed.data.teamId);
  return { success: true, message: "Role updated." };
}

const removeMemberSchema = z.object({
  teamId: z.string().uuid(),
  userId: z.string().uuid(),
});

export async function removeTeamMember(
  _prev: ActionState | null,
  formData: FormData
): Promise<ActionState> {
  await requireAdmin();

  const parsed = removeMemberSchema.safeParse({
    teamId: formData.get("teamId"),
    userId: formData.get("userId"),
  });
  if (!parsed.success) return { error: "Invalid form data." };

  const admin = createAdminClient();

  const { data: team } = await admin
    .from("teams")
    .select("owner_user_id")
    .eq("id", parsed.data.teamId)
    .maybeSingle();
  if (team?.owner_user_id === parsed.data.userId) {
    return { error: "The team owner can't be removed." };
  }

  // Only drops the membership — the auth account and any other team
  // memberships are untouched.
  const { error } = await admin
    .from("team_members")
    .delete()
    .eq("team_id", parsed.data.teamId)
    .eq("user_id", parsed.data.userId);

  if (error) return { error: error.message };

  revalidateTeams(parsed.data.teamId);
  return { success: true, message: "Member removed." };
}

// ── Accounts (the client-isolation onboarding) ──────────────────────────────

const accountSchema = z.object({
  teamId: z.string().uuid(),
  clientId: z.coerce.number().int().positive(),
  action: z.enum(["add", "remove"]),
});

export async function setTeamAccount(
  _prev: ActionState | null,
  formData: FormData
): Promise<ActionState> {
  await requireAdmin();

  const parsed = accountSchema.safeParse({
    teamId: formData.get("teamId"),
    clientId: formData.get("clientId"),
    action: formData.get("action"),
  });
  if (!parsed.success) return { error: "Invalid form data." };

  const admin = createAdminClient();
  const { teamId, clientId, action } = parsed.data;

  if (action === "add") {
    const { error } = await admin
      .from("team_accounts")
      .upsert({ team_id: teamId, client_id: clientId }, { onConflict: "team_id,client_id" });
    if (error) return { error: error.message };
    revalidateTeams(teamId);
    return { success: true, message: "Account added to team." };
  }

  const { error } = await admin
    .from("team_accounts")
    .delete()
    .eq("team_id", teamId)
    .eq("client_id", clientId);
  if (error) return { error: error.message };

  revalidateTeams(teamId);
  return { success: true, message: "Account removed from team." };
}
