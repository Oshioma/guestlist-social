// Membership helper — server-side only.
// Gets the current user, looks up the app row by SITE_APP_KEY,
// checks public.app_memberships, and returns access info.
import "server-only";
import { createClient } from "@/lib/supabase/server";

const APP_KEY = process.env.SITE_APP_KEY ?? "guestlist";

export interface MembershipResult {
  authenticated: boolean;
  hasAccess: boolean;
  role: string | null;
  membershipStatus: string | null;
  user: { id: string; email?: string } | null;
}

export async function getMembership(): Promise<MembershipResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      authenticated: false,
      hasAccess: false,
      role: null,
      membershipStatus: null,
      user: null,
    };
  }

  // Look up the app row by key
  const { data: app } = await supabase
    .from("apps")
    .select("id")
    .eq("key", APP_KEY)
    .maybeSingle();

  if (!app) {
    return {
      authenticated: true,
      hasAccess: false,
      role: null,
      membershipStatus: null,
      user,
    };
  }

  // Check app_memberships for this user + app
  const { data: membership } = await supabase
    .from("app_memberships")
    .select("role, status")
    .eq("user_id", user.id)
    .eq("app_id", app.id)
    .maybeSingle();

  // Only grant access when membership is active
  const hasAccess = membership?.status === "active";

  return {
    authenticated: true,
    hasAccess,
    role: membership?.role ?? null,
    membershipStatus: membership?.status ?? null,
    user,
  };
}
