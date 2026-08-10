// Validates a `next` query param for safe internal redirect.
// Allowlist is tight: internal absolute path only, no protocol-relative or
// path-smuggling shapes. Anything dodgy falls back to "/post-login" which
// will role-dispatch the viewer correctly.

// Route prefixes that must never be a post-login destination. Sending a
// freshly authenticated user back onto an auth page makes a *successful* login
// look like it silently failed — the classic "I sign in and it just redirects
// me back to the sign-in page, I can't get in" report. It also covers the
// self-referential `/post-login` the sign-in form bakes in on a direct visit,
// so the dispatcher resolves to the real destination in one hop instead of
// ping-ponging through itself. Anything on this list falls back to
// "/post-login", which role-dispatches the viewer into the app.
const AUTH_ROUTE_PREFIXES = [
  "/sign-in",
  "/sign-up",
  "/sign-out",
  "/post-login",
  "/forgot-password",
  "/reset-password",
  "/accept-invite",
  "/auth",
];

function isAuthRoute(next: string): boolean {
  // Compare on the path alone, ignoring any query string or hash.
  const path = (next.split(/[?#]/)[0] || "/").replace(/\/+$/, "") || "/";
  return AUTH_ROUTE_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
}

// True only for an internal app path that is safe to redirect to after login:
// absolute, not protocol-relative, not path-smuggling, and not an auth page.
export function isSafeInternalPath(
  next: string | null | undefined
): next is string {
  if (!next) return false;
  if (!next.startsWith("/")) return false;
  if (next.startsWith("//")) return false;
  if (next.startsWith("/\\")) return false;
  if (isAuthRoute(next)) return false;
  return true;
}

export function getSafeNext(next: string | null | undefined): string {
  return isSafeInternalPath(next) ? next : "/post-login";
}
