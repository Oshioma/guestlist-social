// ---------------------------------------------------------------------------
// Viewer resolution.
//
// Every page that needs to know "who is looking at this and what are they
// allowed to see" goes through getViewer(). It looks up the current Supabase
// auth user, then decides admission:
//   - a client_user_links row      → client portal user (scoped to a client)
//   - else a user_roles row         → admin-panel user
//   - neither                       → NOT admitted (null)
//
// Admission is deny-by-default: an authenticated account with no client link
// and no user_roles row resolves to null. This is what keeps an account that
// slipped past sign-up (there is no public sign-up — admission is invite-only)
// from silently gaining admin-panel access. Legitimate accounts are admitted
// only when an admin invites them (which writes a user_roles row) or they are
// linked to a client.
//
// Why server-side: viewer state must be authoritative (a client must not be
// able to flip themselves into admin from the browser), and every gate in
// the app — middleware redirects, query scoping, button gating — runs in
// server components.
// ---------------------------------------------------------------------------

import "server-only";
import { createClient } from "@/lib/supabase/server";

export type Viewer =
  | { role: "admin"; userId: string; email: string | null }
  | {
      role: "client";
      userId: string;
      email: string | null;
      clientId: number;
    };

export async function getViewer(): Promise<Viewer | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: link } = await supabase
    .from("client_user_links")
    .select("client_id")
    .eq("auth_user_id", user.id)
    .order("id", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (link) {
    return {
      role: "client",
      userId: user.id,
      email: user.email ?? null,
      clientId: (link as any).client_id as number,
    };
  }

  // No client link — admitted to the admin panel only with an explicit
  // user_roles row. Missing row → not admitted (deny-by-default).
  const { data: roleRow } = await supabase
    .from("user_roles")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!roleRow) return null;

  return { role: "admin", userId: user.id, email: user.email ?? null };
}

// assertCanViewClient: defense-in-depth gate every portal page calls before
// pulling client-scoped data. Middleware should already have bounced any
// disallowed access, but keeping the check on the page makes the data
// scoping explicit and safe even if a route is added later that someone
// forgot to wire into middleware.
export function canViewClient(viewer: Viewer | null, clientId: number): boolean {
  if (!viewer) return false;
  if (viewer.role === "admin") return true;
  return viewer.clientId === clientId;
}
