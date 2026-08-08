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

import { redirect } from "next/navigation";
import { getViewer } from "../admin-panel/lib/viewer";
import { getProoferAccess } from "@/lib/auth/permissions";

export const dynamic = "force-dynamic";

function getSafeNext(next?: string) {
  if (!next) return "/app/dashboard";

  // Allow only internal absolute paths, but block protocol-relative and odd cases
  if (!next.startsWith("/")) return "/app/dashboard";
  if (next.startsWith("//")) return "/app/dashboard";
  if (next.startsWith("/\\")) return "/app/dashboard";

  return next;
}

export default async function PostLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const viewer = await getViewer();

  // Agency staff (admin) — honor validated `next`, otherwise the dashboard.
  if (viewer?.role === "admin") {
    redirect(getSafeNext(next));
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
