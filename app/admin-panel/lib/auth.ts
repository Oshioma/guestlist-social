// Back-compat shim. The admin-panel layout now calls getMemberAccess()
// directly; this helper stays so any lingering page imports keep working.
//
// New role model: 'admin' | 'member'. Missing user_roles row → 'member'.
// Anything under /app admits both; specific pages gate on ads access via
// requireAdsAccess().

import { redirect } from "next/navigation";
import { getMemberAccess, type MemberRole } from "@/lib/auth/permissions";

export type AppRole = MemberRole;

export async function requireAdminPanelAccess(
  allowedRoles: AppRole[] = ["admin", "member"]
) {
  const access = await getMemberAccess();

  if (!access) {
    redirect("/sign-in");
  }

  if (!allowedRoles.includes(access.role)) {
    redirect("/post-login");
  }

  return {
    user: { id: access.userId, email: access.email },
    role: access.role,
  };
}
