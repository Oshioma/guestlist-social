// Permission helpers for the admin-panel surface.
//
// Two gates sit on top of the existing getViewer() role resolution:
//   - requireAdmin()      — for member-management pages
//   - requireAdsAccess()  — for create/edit-ad surfaces
//
// Ad access follows ROLE, not a manual toggle: agency admins, and anyone who
// is an owner / admin / proofer of a real (shared) team, may run ads. Creators
// (the stored 'member' role) may not. See adsAllowedForUser() below.
//
// Both gates redirect rather than throw — server components that call them will
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

// Whether a user may run ads, derived from their roles rather than a stored
// flag. True when they are an agency admin, an admin/proofer of any team, or
// the owner of a *shared* team (one with more than just themselves). Ownership
// of a solo personal team — which everyone now has — deliberately does NOT
// grant it, so ads stay limited to trusted roles.
async function adsAllowedForUser(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  agencyRole: MemberRole
): Promise<boolean> {
  if (agencyRole === "admin") return true;

  const { data: memberships } = await supabase
    .from("team_members")
    .select("team_id, role")
    .eq("user_id", userId);
  const rows = (memberships ?? []) as { team_id: string; role: string }[];

  if (rows.some((r) => r.role === "admin" || r.role === "proofer")) return true;

  const ownedTeamIds = rows.filter((r) => r.role === "owner").map((r) => r.team_id);
  if (ownedTeamIds.length === 0) return false;

  // Owner counts only for a shared team (>1 member). RLS scopes team_members to
  // teams the caller belongs to, so this only sees their own teams' rows.
  const { data: memberRows } = await supabase
    .from("team_members")
    .select("team_id")
    .in("team_id", ownedTeamIds);
  const counts = new Map<string, number>();
  for (const m of (memberRows ?? []) as { team_id: string }[]) {
    counts.set(m.team_id, (counts.get(m.team_id) ?? 0) + 1);
  }
  return ownedTeamIds.some((id) => (counts.get(id) ?? 0) > 1);
}

// Returns null when the viewer is not signed in, is a client-portal user, or
// is not admitted. Admission is deny-by-default: an admin-panel user must have
// an explicit user_roles row. A missing row means the account was never
// invited, so it is NOT admitted (returns null) rather than defaulting to a
// member. Keep this in sync with getViewer() and middleware.ts.
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
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  // No row → not admitted. Deny rather than default to member.
  if (!row) return null;

  const role: MemberRole = (row.role as MemberRole) === "admin" ? "admin" : "member";
  const canRunAds = await adsAllowedForUser(supabase, user.id, role);

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

// getProoferAccess: who may use the Proofer board surface. Broader than
// getMemberAccess (which gates the full admin panel): it admits agency staff
// AND team posters — a member/admin/owner of any team. RLS scopes what each
// one sees and writes (their teams' accounts). A user who is only a 'client'
// of a team is NOT admitted here — they use the portal instead.
export type ProoferAccess = {
  userId: string;
  email: string | null;
  kind: "staff" | "poster";
};

export async function getProoferAccess(): Promise<ProoferAccess | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // Agency staff (a user_roles row) get in as staff.
  const { data: roleRow } = await supabase
    .from("user_roles")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (roleRow) {
    return { userId: user.id, email: user.email ?? null, kind: "staff" };
  }

  // Otherwise, a posting role in any team. RLS scopes team_members to the
  // caller's own memberships, so this only sees their rows.
  const { data: poster } = await supabase
    .from("team_members")
    .select("role")
    .in("role", ["owner", "admin", "proofer", "member"])
    .limit(1)
    .maybeSingle();
  if (poster) {
    return { userId: user.id, email: user.email ?? null, kind: "poster" };
  }

  return null;
}

// Super admins — the platform owner(s). Configured via the SUPER_ADMIN_EMAILS
// env var (comma-separated, case-insensitive), so admins can be added or
// changed without a code deploy. Falls back to the founder's address if the
// var isn't set, so the feature keeps working out of the box. Only these
// accounts see the Super admin page + nav link and can invite people to their
// own independent team.
const DEFAULT_SUPER_ADMIN_EMAILS = "oshi@guestlist.net";

export function superAdminEmails(): string[] {
  return (process.env.SUPER_ADMIN_EMAILS || DEFAULT_SUPER_ADMIN_EMAILS)
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export async function isSuperAdmin(): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const email = (user?.email ?? "").toLowerCase();
  return email !== "" && superAdminEmails().includes(email);
}
