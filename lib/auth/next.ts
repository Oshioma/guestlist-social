// Validates a `next` query param for safe internal redirect.
// Allowlist is tight: internal absolute path only, no protocol-relative or
// path-smuggling shapes. Anything dodgy falls back to "/post-login" which
// will role-dispatch the viewer correctly.
export function getSafeNext(next: string | null | undefined): string {
  if (!next) return "/post-login";
  if (!next.startsWith("/")) return "/post-login";
  if (next.startsWith("//")) return "/post-login";
  if (next.startsWith("/\\")) return "/post-login";
  return next;
}
