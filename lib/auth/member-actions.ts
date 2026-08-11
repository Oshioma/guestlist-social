"use server";

// Service-role actions that mutate team membership. Every action calls
// requireAdmin() first so a non-admin member can never invite, edit, or
// remove anyone — even if they somehow reach the URL.
//
// Invites route through Supabase's admin.inviteUserByEmail — it handles
// the email template, token generation, and auth.users insertion. We then
// upsert the user_roles row so the role is set even before the invitee clicks
// through. (Ad access is no longer stored here — it follows the person's role;
// see permissions.adsAllowedForUser.)

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/permissions";
import { authRedirectOrigin } from "@/lib/auth/request-origin";

export type ActionState = {
  error?: string | null;
  fieldErrors?: Partial<Record<string, string[]>>;
  success?: boolean;
  message?: string;
};

const inviteSchema = z.object({
  email: z.string().email("Enter a valid email address."),
  role: z.enum(["admin", "member"]),
});

const updateSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(["admin", "member"]),
});

const removeSchema = z.object({
  userId: z.string().uuid(),
});


export async function inviteMember(
  _prevState: ActionState | null,
  formData: FormData
): Promise<ActionState> {
  const actor = await requireAdmin();

  const parsed = inviteSchema.safeParse({
    email: formData.get("email"),
    role: formData.get("role"),
  });
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const { email, role } = parsed.data;

  // Stop an admin from re-inviting themselves and overwriting their own role.
  if (actor.email && email.toLowerCase() === actor.email.toLowerCase()) {
    return { error: "You're already a member — this would overwrite your own role." };
  }

  const admin = createAdminClient();

  // Create + invite a brand-new user, OR recover one that already exists.
  // inviteUserByEmail ERRORS if the address is already registered — and the old
  // code bailed there, never reaching the user_roles upsert. That stranded any
  // account whose role row wasn't saved the first time: they can sign in but
  // are admitted to nothing (bounced to /sign-in?error=not-authorized), and
  // re-inviting to fix it just errored again. So on an invite failure we look
  // the account up and reuse it, then ALWAYS (re)apply the role below — which
  // makes re-inviting the repair path for a stranded member.
  let userId: string | undefined;
  let alreadyExisted = false;

  const { data: invited, error: inviteErr } =
    await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${await authRedirectOrigin()}/auth/callback?type=invite`,
    });

  if (!inviteErr && invited?.user) {
    userId = invited.user.id;
  } else {
    // Most likely "already registered" — find the existing account and reuse it
    // rather than failing. (perPage mirrors resolveOrInviteUser in team-actions.)
    const { data: list } = await admin.auth.admin.listUsers({ perPage: 200 });
    const existing = list?.users?.find(
      (u) => (u.email ?? "").toLowerCase() === email.toLowerCase()
    );
    if (existing) {
      userId = existing.id;
      alreadyExisted = true;
    } else {
      return { error: inviteErr?.message ?? "Could not send invite." };
    }
  }

  const upsert = await admin
    .from("user_roles")
    .upsert(
      {
        user_id: userId,
        role,
      },
      { onConflict: "user_id" }
    );

  if (upsert.error) {
    return {
      error: `Could not save the member's role: ${upsert.error.message}`,
    };
  }

  // New staff also get their own personal team by default (idempotent).
  await admin.rpc("ensure_personal_team", {
    p_user: userId,
    p_name: `${(email.split("@")[0] || "My")}'s Team`,
  });

  revalidatePath("/app/settings/members");
  return {
    success: true,
    message: alreadyExisted
      ? `${email} already had an account — their access is set. They can sign in now (or reset their password).`
      : `Invite sent to ${email}.`,
  };
}

export async function updateMember(
  _prevState: ActionState | null,
  formData: FormData
): Promise<ActionState> {
  const actor = await requireAdmin();

  const parsed = updateSchema.safeParse({
    userId: formData.get("userId"),
    role: formData.get("role"),
  });
  if (!parsed.success) {
    return { error: "Invalid form data." };
  }

  // Block self-demotion so an admin can't accidentally lock themselves out.
  if (parsed.data.userId === actor.userId && parsed.data.role !== "admin") {
    return { error: "You cannot remove your own admin role." };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("user_roles")
    .upsert(
      {
        user_id: parsed.data.userId,
        role: parsed.data.role,
      },
      { onConflict: "user_id" }
    );

  if (error) return { error: error.message };

  revalidatePath("/app/settings/members");
  return { success: true, message: "Member updated." };
}

export async function removeMember(
  _prevState: ActionState | null,
  formData: FormData
): Promise<ActionState> {
  const actor = await requireAdmin();

  const parsed = removeSchema.safeParse({ userId: formData.get("userId") });
  if (!parsed.success) return { error: "Invalid form data." };

  if (parsed.data.userId === actor.userId) {
    return { error: "You cannot remove yourself." };
  }

  const admin = createAdminClient();

  // user_roles row cascades on auth.users delete — no need to clean it up.
  const { error } = await admin.auth.admin.deleteUser(parsed.data.userId);
  if (error) return { error: error.message };

  revalidatePath("/app/settings/members");
  return { success: true, message: "Member removed." };
}
