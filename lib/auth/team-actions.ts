"use server";

// Service-role actions for the teams management surface, authorized PER TEAM.
//
// Authorization model:
//   - Agency staff (a user_roles row) may manage any team.
//   - A team's owner or admin may manage THAT team (rename, plan, delete,
//     invite, roles, accounts) — but no other team.
//   - Creating a team is open to any admitted non-client user (staff or a
//     team poster); the creator becomes the owner.
// Mutations run through the service-role client, so the per-team check below
// is the real gate — never assume the caller only reached an allowed page.
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
// Inviting a *client* (a read/approve viewer) is always allowed.

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { authRedirectOrigin } from "@/lib/auth/request-origin";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProoferAccess, isSuperAdmin } from "@/lib/auth/permissions";
import { sendEmail } from "@/lib/email";
import { renderEmailTemplate } from "@/lib/email/templates";

export type ActionState = {
  error?: string | null;
  fieldErrors?: Partial<Record<string, string[]>>;
  success?: boolean;
  message?: string;
};


function revalidateTeams(teamId?: string) {
  revalidatePath("/proofer/teams");
  if (teamId) revalidatePath(`/proofer/teams/${teamId}`);
}

// The signed-in actor plus whether they are agency staff, or null if not
// signed in. Read via the authed (RLS) client so identity is authoritative.
async function getActor(): Promise<{ userId: string; isStaff: boolean } | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: roleRow } = await supabase
    .from("user_roles")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  return { userId: user.id, isStaff: roleRow !== null };
}

// May this actor manage this team? Agency staff → any team; otherwise only a
// team they own or admin. Returns the actor's id on success, or an error
// string suitable for an ActionState.
async function requireTeamManager(
  admin: ReturnType<typeof createAdminClient>,
  teamId: string
): Promise<{ userId?: string; isStaff?: boolean; error?: string }> {
  const actor = await getActor();
  if (!actor) return { error: "You're not signed in." };
  if (actor.isStaff) return { userId: actor.userId, isStaff: true };

  const { data: m } = await admin
    .from("team_members")
    .select("role")
    .eq("team_id", teamId)
    .eq("user_id", actor.userId)
    .maybeSingle();
  if (m && (m.role === "owner" || m.role === "admin")) {
    return { userId: actor.userId, isStaff: false };
  }
  return { error: "You don't have permission to manage this team." };
}

// Remove a client's stored Meta connection for ONE platform. Used by the team
// page to clear a connection that shouldn't be there — e.g. a Facebook Page
// that isn't really this account's — so the connection status stops claiming
// the account is connected when it isn't. Authorized per-team, and the account
// must belong to this team (so a manager can't disconnect an account they
// don't control by passing a foreign client id). Deletes via the service role
// because connected_meta_accounts has RLS with no policies.
export async function disconnectClientPlatform(
  teamId: string,
  clientId: string,
  platform: "facebook" | "instagram"
): Promise<{ ok: boolean; removed?: number; error?: string }> {
  if (!teamId || !clientId) return { ok: false, error: "Missing team or account." };
  if (platform !== "facebook" && platform !== "instagram") {
    return { ok: false, error: "Invalid platform." };
  }

  const admin = createAdminClient();
  const gate = await requireTeamManager(admin, teamId);
  if (gate.error) return { ok: false, error: gate.error };

  const idNum = Number(clientId);
  if (Number.isNaN(idNum)) return { ok: false, error: "Invalid account." };

  const { data: link } = await admin
    .from("team_accounts")
    .select("client_id")
    .eq("team_id", teamId)
    .eq("client_id", idNum)
    .maybeSingle();
  if (!link) return { ok: false, error: "That account isn't in this team." };

  const { data: deleted, error } = await admin
    .from("connected_meta_accounts")
    .delete()
    .eq("client_id", idNum)
    .eq("platform", platform)
    .select("id");
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/proofer/teams/${teamId}`);
  revalidatePath(`/admin-panel/settings/teams/${teamId}`);
  return { ok: true, removed: (deleted ?? []).length };
}

// Find an existing auth user by email, or create + invite a new one. Returns
// the user id either way so the caller can attach a membership. Handles the
// "already registered" case so re-inviting or adding an existing client works.
//
// The invite email goes through our own Resend transport (lib/email), NOT
// Supabase's built-in auth mailer, which is heavily rate-limited on the free
// tier. We create the user and mint a confirmation token with generateLink
// (which does NOT send an email), build a link at our own /auth/callback
// verifyOtp route, and send it ourselves.
//
// Result shape:
//   invited:true    — brand-new user created AND the invite email was sent.
//   invited:false   — the account already existed (no email needed).
//   emailError set  — user was created but the invite email couldn't be sent;
//                     the caller should surface this so the operator can
//                     resend once email is configured.
async function resolveOrInviteUser(
  admin: ReturnType<typeof createAdminClient>,
  email: string,
  opts?: { teamName?: string }
): Promise<{
  userId?: string;
  invited?: boolean;
  emailError?: string;
  error?: string;
}> {
  try {
    // Create the user + mint an invite token without triggering Supabase's
    // (rate-limited) built-in email. We deliver the email via Resend below.
    // authRedirectOrigin() keeps the invitee on the domain the invite was sent
    // from (postproofer.com vs the main app).
    const origin = await authRedirectOrigin();
    const { data, error } = await admin.auth.admin.generateLink({
      type: "invite",
      email,
      options: { redirectTo: `${origin}/auth/callback?type=invite` },
    });

    if (!error && data?.user && data.properties?.hashed_token) {
      // Point at OUR callback (the verifyOtp path every other auth email uses),
      // not Supabase's raw action_link, so the SSR session is established the
      // same way and the invitee lands on /accept-invite.
      const link = `${origin}/auth/callback?token_hash=${encodeURIComponent(
        data.properties.hashed_token
      )}&type=invite`;
      const { subject, html, text } = await renderEmailTemplate("invite", {
        team_name: opts?.teamName?.trim() || "Post Proofer",
        accept_link: link,
      });
      const sent = await sendEmail({ to: email, subject, html, text });
      if (sent.ok) return { userId: data.user.id, invited: true };

      // User exists now but we couldn't email them — surface why so the
      // operator knows to configure Resend (or check the address) and resend.
      const reason = sent.skipped ? sent.reason : sent.error;
      return { userId: data.user.id, invited: false, emailError: reason };
    }

    // generateLink failed — most commonly because the account already exists.
    // Look it up and reuse it rather than surfacing an error.
    const { data: list } = await admin.auth.admin.listUsers({ perPage: 200 });
    const existing = list?.users?.find(
      (u) => (u.email ?? "").toLowerCase() === email.toLowerCase()
    );
    if (existing) return { userId: existing.id, invited: false };

    return { error: error?.message ?? "Could not invite that email." };
  } catch (e) {
    // Never let a thrown error (bad service key, network) crash the page —
    // surface it as a readable message.
    console.error("resolveOrInviteUser threw:", e);
    return {
      error:
        e instanceof Error
          ? `Invite failed: ${e.message}`
          : "Invite failed unexpectedly.",
    };
  }
}

// ── Create / rename / plan / delete ────────────────────────────────────────

const createSchema = z.object({
  name: z.string().trim().min(1, "Give the team a name.").max(120),
  plan: z.enum(["free", "pro", "agency"]).default("free"),
});

export async function createTeam(
  _prev: ActionState | null,
  formData: FormData
): Promise<ActionState> {
  // Anyone admitted to the Proofer surface (agency staff or a team poster)
  // can start a team; they become its owner. Clients cannot.
  const access = await getProoferAccess();
  if (!access) {
    return { error: "You need an account to create a team." };
  }
  const actorUserId = access.userId;

  const parsed = createSchema.safeParse({
    name: formData.get("name"),
    plan: formData.get("plan") ?? "free",
  });
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  // New teams always start on Free — a paid plan is earned through Stripe
  // checkout, not chosen for free at creation. Only agency staff may seed a
  // team on a paid plan directly (e.g. comping an account).
  const plan = access.kind === "staff" ? parsed.data.plan : "free";

  const admin = createAdminClient();

  const { data: team, error } = await admin
    .from("teams")
    .insert({ name: parsed.data.name, owner_user_id: actorUserId, plan })
    .select("id")
    .single();

  if (error || !team) {
    return { error: error?.message ?? "Could not create the team." };
  }

  // The creator is the owner.
  const { error: memberErr } = await admin
    .from("team_members")
    .insert({ team_id: team.id, user_id: actorUserId, role: "owner" });

  if (memberErr) {
    return { error: `Team created, but owner could not be set: ${memberErr.message}` };
  }

  revalidateTeams(team.id);
  return { success: true, message: `Team "${parsed.data.name}" created.` };
}

// Invite someone to their OWN independent team (self-serve style, but targeted
// rather than a public sign-up door). Agency-staff only: it provisions a new
// account + a team owned by that person. If they already have an account /
// owned team, this is a no-op beyond (re)sending the invite. They land on the
// Proofer as owner of an empty team, ready to add + connect their own accounts.
const inviteOwnerSchema = z.object({
  email: z.string().email("Enter a valid email address."),
  teamName: z.string().trim().max(120).optional(),
});

export async function inviteToOwnTeam(
  _prev: ActionState | null,
  formData: FormData
): Promise<ActionState> {
  if (!(await isSuperAdmin())) {
    return { error: "Only the super admin can invite someone to their own team." };
  }

  const parsed = inviteOwnerSchema.safeParse({
    email: formData.get("email"),
    teamName: (formData.get("teamName") as string) || undefined,
  });
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  try {
    const admin = createAdminClient();
    const localPart = parsed.data.email.split("@")[0] || "New";
    const teamName = parsed.data.teamName?.trim() || `${localPart}'s Team`;

    const resolved = await resolveOrInviteUser(admin, parsed.data.email, {
      teamName,
    });
    if (resolved.error || !resolved.userId) {
      return { error: resolved.error ?? "Could not invite that email." };
    }

    // ensure_personal_team is idempotent: creates the owned team if they don't
    // have one, otherwise returns their existing one.
    const { error } = await admin.rpc("ensure_personal_team", {
      p_user: resolved.userId,
      p_name: teamName,
    });
    if (error) {
      return { error: `Invite sent, but their team couldn't be set up: ${error.message}` };
    }

    revalidatePath("/proofer/teams");
    if (resolved.emailError) {
      return {
        success: true,
        message: `${parsed.data.email}'s team is set up, but the invite email couldn't be sent: ${resolved.emailError}`,
      };
    }
    return {
      success: true,
      message: resolved.invited
        ? `Invite sent to ${parsed.data.email} — they'll own their own team.`
        : `${parsed.data.email} already has an account; their own team is set up.`,
    };
  } catch (e) {
    console.error("inviteToOwnTeam threw:", e);
    return {
      error:
        e instanceof Error
          ? `Couldn't complete the invite: ${e.message}`
          : "Couldn't complete the invite.",
    };
  }
}

const renameSchema = z.object({
  teamId: z.string().uuid(),
  name: z.string().trim().min(1, "Name can't be empty.").max(120),
});

export async function renameTeam(
  _prev: ActionState | null,
  formData: FormData
): Promise<ActionState> {
  const parsed = renameSchema.safeParse({
    teamId: formData.get("teamId"),
    name: formData.get("name"),
  });
  if (!parsed.success) return { error: "Invalid form data." };

  const admin = createAdminClient();
  const gate = await requireTeamManager(admin, parsed.data.teamId);
  if (gate.error) return { error: gate.error };

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
  plan: z.enum(["free", "pro", "agency"]),
});

// Manual plan override — agency-staff only. Real customers change plan through
// Stripe checkout / the billing portal (which drives teams.plan via the
// webhook); this exists so staff can comp an account or fix up a plan without a
// live subscription. Owners/admins can no longer flip their own plan for free.
export async function setTeamPlan(
  _prev: ActionState | null,
  formData: FormData
): Promise<ActionState> {
  const parsed = planSchema.safeParse({
    teamId: formData.get("teamId"),
    plan: formData.get("plan"),
  });
  if (!parsed.success) return { error: "Invalid form data." };

  const admin = createAdminClient();
  const gate = await requireTeamManager(admin, parsed.data.teamId);
  if (gate.error) return { error: gate.error };
  if (!gate.isStaff) {
    return { error: "Plan changes go through billing. Use the upgrade buttons below." };
  }

  const { error } = await admin
    .from("teams")
    .update({ plan: parsed.data.plan })
    .eq("id", parsed.data.teamId);

  if (error) return { error: error.message };

  revalidateTeams(parsed.data.teamId);
  const label =
    parsed.data.plan === "agency" ? "Agency" : parsed.data.plan === "pro" ? "Pro" : "Free";
  return { success: true, message: `Plan set to ${label} (staff override).` };
}

const deleteSchema = z.object({ teamId: z.string().uuid() });

export async function deleteTeam(
  _prev: ActionState | null,
  formData: FormData
): Promise<ActionState> {
  const parsed = deleteSchema.safeParse({ teamId: formData.get("teamId") });
  if (!parsed.success) return { error: "Invalid form data." };

  const admin = createAdminClient();
  const gate = await requireTeamManager(admin, parsed.data.teamId);
  if (gate.error) return { error: gate.error };

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

  revalidatePath("/proofer/teams");
  return { success: true, message: "Team deleted." };
}

// ── Membership ──────────────────────────────────────────────────────────────

const inviteSchema = z.object({
  teamId: z.string().uuid(),
  email: z.string().email("Enter a valid email address."),
  role: z.enum(["admin", "proofer", "member", "client"]),
});

export async function inviteToTeam(
  _prev: ActionState | null,
  formData: FormData
): Promise<ActionState> {
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
  const gate = await requireTeamManager(admin, teamId);
  if (gate.error) return { error: gate.error };

  const { data: team } = await admin
    .from("teams")
    .select("name, plan")
    .eq("id", teamId)
    .maybeSingle();

  // Paid gate: collaborators (member/admin) need a paid team (Pro or Agency) —
  // inviting people is a "Teams" feature. Clients are always allowed, since
  // giving a client sight of their own content is core, not an upsell.
  if (role === "admin" || role === "proofer" || role === "member") {
    if ((team?.plan ?? "free") === "free") {
      return { error: "Upgrade this team to Pro or Agency to invite admins, proofers or creators." };
    }
  }

  const resolved = await resolveOrInviteUser(admin, email, {
    teamName: team?.name ?? undefined,
  });
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

  // Everyone who's invited also gets their own personal team by default
  // (idempotent: a no-op if they already have one).
  await admin.rpc("ensure_personal_team", {
    p_user: resolved.userId,
    p_name: `${(email.split("@")[0] || "My")}'s Team`,
  });

  revalidateTeams(teamId);
  if (resolved.emailError) {
    return {
      success: true,
      message: `${email} was added, but the invite email couldn't be sent: ${resolved.emailError}`,
    };
  }
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
  role: z.enum(["admin", "proofer", "member", "client"]),
});

export async function updateTeamMemberRole(
  _prev: ActionState | null,
  formData: FormData
): Promise<ActionState> {
  const parsed = roleSchema.safeParse({
    teamId: formData.get("teamId"),
    userId: formData.get("userId"),
    role: formData.get("role"),
  });
  if (!parsed.success) return { error: "Invalid form data." };

  const admin = createAdminClient();
  const gate = await requireTeamManager(admin, parsed.data.teamId);
  if (gate.error) return { error: gate.error };

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

  // Same paid gate as invites: promoting someone to a collaborator role needs
  // a paid team (Pro or Agency).
  if (
    (parsed.data.role === "admin" ||
      parsed.data.role === "proofer" ||
      parsed.data.role === "member") &&
    (team?.plan ?? "free") === "free"
  ) {
    return { error: "Upgrade this team to Pro or Agency to assign admin, proofer or creator roles." };
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
  const parsed = removeMemberSchema.safeParse({
    teamId: formData.get("teamId"),
    userId: formData.get("userId"),
  });
  if (!parsed.success) return { error: "Invalid form data." };

  const admin = createAdminClient();
  const gate = await requireTeamManager(admin, parsed.data.teamId);
  if (gate.error) return { error: gate.error };

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

// ── Create a brand-new account inside a team (self-serve onboarding) ─────────

const createAccountSchema = z.object({
  teamId: z.string().uuid(),
  name: z.string().trim().min(1, "Give the account a name.").max(120),
});

export async function createTeamAccount(
  _prev: ActionState | null,
  formData: FormData
): Promise<ActionState> {
  const parsed = createAccountSchema.safeParse({
    teamId: formData.get("teamId"),
    name: formData.get("name"),
  });
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const admin = createAdminClient();
  const gate = await requireTeamManager(admin, parsed.data.teamId);
  if (gate.error) return { error: gate.error };

  const { data: client, error } = await admin
    .from("clients")
    .insert({
      name: parsed.data.name,
      platform: "Meta",
      status: "testing",
      monthly_budget: 0,
    })
    .select("id")
    .single();

  if (error || !client) {
    return { error: error?.message ?? "Could not create the account." };
  }

  const { error: linkErr } = await admin
    .from("team_accounts")
    .upsert(
      { team_id: parsed.data.teamId, client_id: client.id },
      { onConflict: "team_id,client_id" }
    );
  if (linkErr) {
    return { error: `Account created, but couldn't add it to the team: ${linkErr.message}` };
  }

  revalidateTeams(parsed.data.teamId);
  return {
    success: true,
    message: `"${parsed.data.name}" created. Connect Instagram/Facebook to it below.`,
  };
}

// Wizard variant: create an account in a chosen team and return its new id so
// the caller can lead straight into the "connect Instagram/Facebook" step. Same
// gate as createTeamAccount (staff, or the team's owner/admin).
export async function createAccountInTeam(
  teamId: string,
  name: string
): Promise<{ clientId?: number; error?: string; fieldError?: string }> {
  const parsed = createAccountSchema.safeParse({ teamId, name });
  if (!parsed.success) {
    const fe = parsed.error.flatten().fieldErrors;
    return { fieldError: fe.name?.[0] ?? fe.teamId?.[0] ?? "Invalid input." };
  }

  const admin = createAdminClient();
  const gate = await requireTeamManager(admin, parsed.data.teamId);
  if (gate.error) return { error: gate.error };

  const { data: client, error } = await admin
    .from("clients")
    .insert({
      name: parsed.data.name,
      platform: "Meta",
      status: "testing",
      monthly_budget: 0,
    })
    .select("id")
    .single();
  if (error || !client) {
    return { error: error?.message ?? "Could not create the account." };
  }

  const { error: linkErr } = await admin
    .from("team_accounts")
    .upsert(
      { team_id: parsed.data.teamId, client_id: client.id },
      { onConflict: "team_id,client_id" }
    );
  if (linkErr) {
    return { error: `Account created, but couldn't add it to the team: ${linkErr.message}` };
  }

  revalidateTeams(parsed.data.teamId);
  return { clientId: Number(client.id) };
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
  const parsed = accountSchema.safeParse({
    teamId: formData.get("teamId"),
    clientId: formData.get("clientId"),
    action: formData.get("action"),
  });
  if (!parsed.success) return { error: "Invalid form data." };

  const admin = createAdminClient();
  const { teamId, clientId, action } = parsed.data;

  const gate = await requireTeamManager(admin, teamId);
  if (gate.error) return { error: gate.error };

  if (action === "add") {
    // Guard against privilege escalation: a non-staff manager could otherwise
    // pull an arbitrary account into their team and gain access to its content
    // via RLS. Restrict adds to accounts they already control (agency staff
    // may add any account).
    if (!gate.isStaff) {
      const { data: managed } = await admin
        .from("team_members")
        .select("team_id")
        .eq("user_id", gate.userId as string)
        .in("role", ["owner", "admin"]);
      const managedTeamIds = (managed ?? []).map((r) => r.team_id);
      const { data: controls } = managedTeamIds.length
        ? await admin
            .from("team_accounts")
            .select("team_id")
            .eq("client_id", clientId)
            .in("team_id", managedTeamIds)
            .limit(1)
            .maybeSingle()
        : { data: null };
      if (!controls) {
        return { error: "You can only add accounts you already manage." };
      }
    }

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
