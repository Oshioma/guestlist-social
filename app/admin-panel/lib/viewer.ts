// ---------------------------------------------------------------------------
// Viewer resolution.
//
// Every page that needs to know "who is looking at this and what are they
// allowed to see" goes through getViewer(). It looks up the current Supabase
// auth user, then checks client_user_links to find out whether they're an
// admin (no link) or a client portal user (one or more links — we use the
// first today, but the table is shaped for multi-tenant viewers later).
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

  if (!link) {
    return { role: "admin", userId: user.id, email: user.email ?? null };
  }

  return {
    role: "client",
    userId: user.id,
    email: user.email ?? null,
    clientId: (link as any).client_id as number,
  };
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
