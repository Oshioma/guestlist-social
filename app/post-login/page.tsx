// ---------------------------------------------------------------------------
// /post-login — server-side dispatcher.
//
// The login form can't know in the browser whether a user is an admin or a
// client portal user — that lookup needs the cookie session. So instead of
// hard-coding /app/dashboard as the destination, the form sends every user
// here, and we redirect server-side based on the viewer's resolved role.
//
//   - No viewer  → /sign-in
//   - Admin      → ?next param or /app/dashboard
//   - Client     → /portal/{theirClientId} (their own room)
//
// This keeps the LoginForm dumb and ensures clients can't accidentally land
// on a 403/redirect loop after signing in.
// ---------------------------------------------------------------------------

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getViewer } from "../admin-panel/lib/viewer";
import { getProoferAccess } from "@/lib/auth/permissions";

export const dynamic = "force-dynamic";

// Hosts that serve the standalone Proofer at their own root. Keep in sync with
// middleware.ts and app/proofer/base.ts. On these hosts an admin login should
// land on the Proofer board ("/"), never the Guestlist admin dashboard (which
// this domain doesn't even expose).
const PROOFER_HOSTS = new Set(["postproofer.com", "www.postproofer.com"]);

function getSafeNext(next: string | undefined, fallback: string) {
  if (!next) return fallback;

  // Allow only internal absolute paths, but block protocol-relative and odd cases
  if (!next.startsWith("/")) return fallback;
  if (next.startsWith("//")) return fallback;
  if (next.startsWith("/\\")) return fallback;

  return next;
}

export default async function PostLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const viewer = await getViewer();

  // Agency staff (admin) — honor validated `next`, otherwise the default. On the
  // standalone Proofer domain the default is the board root ("/"), so an admin
  // login there never bounces through the Guestlist admin dashboard (which this
  // domain doesn't even expose).
  if (viewer?.role === "admin") {
    const host = (await headers()).get("host")?.toLowerCase().split(":")[0] ?? "";
    const fallback = PROOFER_HOSTS.has(host) ? "/" : "/app/dashboard";
    redirect(getSafeNext(next, fallback));
  }

  // Team posters (member/admin/owner of a team, but not agency staff) land on
  // the Proofer board, scoped by RLS to their team's accounts. Checked before
  // the client branch because getViewer() classifies a poster as a client.
  const prooferAccess = await getProoferAccess();
  if (prooferAccess?.kind === "poster") {
    redirect("/proofer");
  }

  if (viewer?.role === "client") {
    // Defensive fallback if role is client but no linked clientId is available
    if (!viewer.clientId) {
      redirect("/sign-in?error=missing_client");
    }
    redirect(`/portal/${viewer.clientId}`);
  }

  redirect("/sign-in");
}
