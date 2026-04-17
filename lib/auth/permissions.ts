// Permission helpers for the admin-panel surface.
//
// Two gates sit on top of the existing getViewer() role resolution:
//   - requireAdmin()      — for member-management pages
//   - requireAdsAccess()  — for create/edit-ad surfaces (can_run_ads flag)
//
// Both redirect rather than throw — server components that call them will
// bounce the user to /post-login (which role-dispatches) instead of showing
// a 403. Buttons that merely need to hide should call canRunAds() and gate
// on the boolean.

import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type MemberRole = "admin" | "member";

export type MemberAccess = {
  userId: string;
  email: string | null;
  role: MemberRole;
  canRunAds: boolean;
};

// Returns null when the viewer is not signed in, or is a client-portal user.
// For admin-panel users, resolves role + can_run_ads from user_roles.
// Missing row → defaults to member / no-ads (least privilege).
export async function getMemberAccess(): Promise<MemberAccess | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // Client-portal users have a client_user_links row — they are not
  // admin-panel members and should never appear in this system.
  const { data: link } = await supabase
    .from("client_user_links")
    .select("client_id")
    .eq("auth_user_id", user.id)
    .limit(1)
    .maybeSingle();
  if (link) return null;

  const { data: row } = await supabase
    .from("user_roles")
    .select("role, can_run_ads")
    .eq("user_id", user.id)
    .maybeSingle();

  const role: MemberRole = (row?.role as MemberRole) === "admin" ? "admin" : "member";
  const canRunAds = Boolean(row?.can_run_ads);

  return {
    userId: user.id,
    email: user.email ?? null,
    role,
    canRunAds,
  };
}

export async function requireAdmin(): Promise<MemberAccess> {
  const access = await getMemberAccess();
  if (!access || access.role !== "admin") {
    redirect("/post-login");
  }
  return access;
}

export async function requireAdsAccess(): Promise<MemberAccess> {
  const access = await getMemberAccess();
  if (!access || !access.canRunAds) {
    redirect("/post-login");
  }
  return access;
}

export async function canRunAds(): Promise<boolean> {
  const access = await getMemberAccess();
  return Boolean(access?.canRunAds);
}

export async function isAdmin(): Promise<boolean> {
  const access = await getMemberAccess();
  return access?.role === "admin";
}
