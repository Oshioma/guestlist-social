import { redirect } from "next/navigation";
import { createClient } from "../../../lib/supabase/server";

export type AppRole = "admin" | "operator" | "viewer";

export async function requireAdminPanelAccess(
  allowedRoles: AppRole[] = ["admin", "operator", "viewer"]
) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Resolve the caller's role. We use maybeSingle() here so that a freshly
  // provisioned Supabase user (created in the Auth dashboard but not yet
  // listed in user_roles) does not 500 on .single() and bounce back to
  // /login — that historical behavior produced an invisible redirect loop.
  //
  // Missing row → default to "viewer" (read-only). Admins who want to
  // promote someone can insert a row into user_roles after the first login.
  const { data: roleRow, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    console.error("requireAdminPanelAccess: user_roles lookup failed", error);
    redirect("/login");
  }

  const role = ((roleRow?.role as AppRole | undefined) ?? "viewer") as AppRole;

  if (!allowedRoles.includes(role)) {
    redirect("/login");
  }

  return {
    user,
    role,
  };
}
