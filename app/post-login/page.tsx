// ---------------------------------------------------------------------------
// /post-login — server-side dispatcher.
//
// The login form can't know in the browser whether a user is an admin or a
// client portal user — that lookup needs the cookie session. So instead of
// hard-coding /app/dashboard as the destination, the form sends every user
// here, and we redirect server-side based on the viewer's resolved role.
//
//   - No viewer  → /login
//   - Admin      → ?next param or /app/dashboard
//   - Client     → /portal/{theirClientId} (their own room)
//
// This keeps the LoginForm dumb and ensures clients can't accidentally land
// on a 403/redirect loop after signing in.
// ---------------------------------------------------------------------------

import { redirect } from "next/navigation";
import { getViewer } from "../admin-panel/lib/viewer";

export const dynamic = "force-dynamic";

export default async function PostLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const viewer = await getViewer();

  if (!viewer) {
    redirect("/login");
  }

  if (viewer.role === "client") {
    // Clients always land in their own portal — even if a stale `next` would
    // have sent them somewhere else. The middleware would bounce them anyway.
    redirect(`/portal/${viewer.clientId}`);
  }

  // Admin: honor the `next` if it's a same-origin path, otherwise default.
  const safeNext = next && next.startsWith("/") ? next : "/app/dashboard";
  redirect(safeNext);
}
