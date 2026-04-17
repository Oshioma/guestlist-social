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

  if (!viewer) {
    redirect("/sign-in");
  }

  if (viewer.role === "client") {
    // Defensive fallback if role is client but no linked clientId is available
    if (!viewer.clientId) {
      redirect("/sign-in?error=missing_client");
    }
    redirect(`/portal/${viewer.clientId}`);
  }

  // Admin: honor validated `next`, otherwise default.
  redirect(getSafeNext(next));
}
