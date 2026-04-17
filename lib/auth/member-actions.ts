"use server";

// Service-role actions that mutate team membership. Every action calls
// requireAdmin() first so a non-admin member can never invite, edit, or
// remove anyone — even if they somehow reach the URL.
//
// Invites route through Supabase's admin.inviteUserByEmail — it handles
// the email template, token generation, and auth.users insertion. We then
// upsert the user_roles row so the role/can_run_ads flags are set even
// before the invitee clicks through.

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

const inviteSchema = z.object({
  email: z.string().email("Enter a valid email address."),
  role: z.enum(["admin", "member"]),
  canRunAds: z.boolean(),
});

const updateSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(["admin", "member"]),
  canRunAds: z.boolean(),
});

const removeSchema = z.object({
  userId: z.string().uuid(),
});

function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}

export async function inviteMember(
  _prevState: ActionState | null,
  formData: FormData
): Promise<ActionState> {
  const actor = await requireAdmin();

  const parsed = inviteSchema.safeParse({
    email: formData.get("email"),
    role: formData.get("role"),
    canRunAds: formData.get("canRunAds") === "on",
  });
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const { email, role, canRunAds } = parsed.data;

  // Guard: an admin cannot give a *member* ads access without escalating
  // them first. It's allowed — role and ads-flag are independent — but
  // stop admins from self-revoking their own rights by mistake.
  if (actor.email && email.toLowerCase() === actor.email.toLowerCase()) {
    return { error: "You're already a member — this would overwrite your own role." };
  }

  const admin = createAdminClient();

  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${siteUrl()}/auth/callback?type=invite`,
  });

  if (error || !data.user) {
    return { error: error?.message ?? "Could not send invite." };
  }

  const upsert = await admin
    .from("user_roles")
    .upsert(
      {
        user_id: data.user.id,
        role,
        can_run_ads: canRunAds,
      },
      { onConflict: "user_id" }
    );

  if (upsert.error) {
    return {
      error: `Invite sent, but role save failed: ${upsert.error.message}`,
    };
  }

  revalidatePath("/app/settings/members");
  return {
    success: true,
    message: `Invite sent to ${email}.`,
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
    canRunAds: formData.get("canRunAds") === "on",
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
        can_run_ads: parsed.data.canRunAds,
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
