// ---------------------------------------------------------------------------
// lib/app_memberships.ts — membership validation helper.
//
// This module exports `isUserMember`, the single function the middleware calls
// to decide whether a token holder is a valid member of the "guestlist" app.
//
// ── Demo / stub ─────────────────────────────────────────────────────────────
// The current implementation accepts ANY non-empty token as valid.  This lets
// you ship and test the auth flow end-to-end before wiring up the real
// membership back-end.
//
// ── Replacing with real logic ───────────────────────────────────────────────
// When you are ready to enforce real memberships, replace the body of
// `isUserMember` with one of the patterns below:
//
//   Pattern A — REST API call (e.g. hotname.co.uk membership endpoint):
//     const res = await fetch(
//       "https://hotname.co.uk/api/memberships/validate",
//       { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }
//     );
//     if (!res.ok) return false;
//     const { app_memberships } = await res.json();
//     return Array.isArray(app_memberships) && app_memberships.includes("guestlist");
//
//   Pattern B — JWT decode (no network call, requires shared secret):
//     import jwt from "jsonwebtoken";
//     const payload = jwt.verify(token, process.env.JWT_SECRET!) as { apps?: string[] };
//     return Array.isArray(payload.apps) && payload.apps.includes("guestlist");
//
//   Pattern C — Supabase lookup (if memberships live in your own DB):
//     const { data } = await supabase
//       .from("app_memberships")
//       .select("id")
//       .eq("token", token)
//       .eq("app", "guestlist")
//       .maybeSingle();
//     return data !== null;
//
// ── Usage ────────────────────────────────────────────────────────────────────
//   import { isUserMember } from "@/lib/app_memberships";
//
//   const member = await isUserMember(token);
//   if (!member) return NextResponse.redirect(new URL("/login", request.url));
// ---------------------------------------------------------------------------

/**
 * Returns `true` when the supplied token grants membership to this app.
 *
 * @param token - The raw token string from the `token` cookie (may be undefined
 *                if the cookie is absent).
 *
 * @remarks
 * Current implementation is a **stub** that accepts every non-empty token.
 * Replace the function body with a real membership check before going to
 * production (see the patterns documented above).
 *
 * A guard is in place to prevent accidental deployment of the stub to
 * production — set `MEMBERSHIP_STUB_OK=true` in your production env only if
 * you intentionally want to keep the stub active (not recommended).
 */
export async function isUserMember(token: string | undefined): Promise<boolean> {
  if (process.env.NODE_ENV === "production" && process.env.MEMBERSHIP_STUB_OK !== "true") {
    throw new Error(
      "isUserMember: stub implementation must be replaced before going to production. " +
      "See lib/app_memberships.ts for ready-to-use patterns."
    );
  }

  // TODO: replace with a real app_memberships check (see patterns above).
  return typeof token === "string" && token.length > 0;
}
