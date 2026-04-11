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

  const { data: roleRow, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .single();

  if (error || !roleRow) {
    redirect("/login");
  }

  if (!allowedRoles.includes(roleRow.role as AppRole)) {
    redirect("/login");
  }

  return {
    user,
    role: roleRow.role as AppRole,
  };
}
