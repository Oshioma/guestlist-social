import "server-only";
import { headers } from "next/headers";

function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}

// Hosts that serve the standalone Proofer at their own root (keep in sync with
// app/proofer/base.ts + middleware.ts).
const PROOFER_HOSTS = new Set(["postproofer.com", "www.postproofer.com"]);

// The origin an emailed auth link (invite / confirmation) should point back to.
//
// The whole post-click chain — /auth/callback → /post-login → /proofer — is
// origin-relative, so once the invitee lands on the right domain they stay on
// it. The one place a wrong domain leaks in is this first hop: the link baked
// into the email. An invite sent from the standalone Proofer domain must keep
// the invitee ON that domain; everywhere else we use NEXT_PUBLIC_SITE_URL.
//
// NB: the target must also be in Supabase Auth's Redirect URLs allowlist, or
// Supabase ignores redirectTo and falls back to the Site URL.
export async function authRedirectOrigin(): Promise<string> {
  try {
    const h = await headers();
    const host = h.get("host")?.toLowerCase().split(":")[0] ?? "";
    if (PROOFER_HOSTS.has(host)) {
      const proto = h.get("x-forwarded-proto") ?? "https";
      return `${proto}://${host}`;
    }
  } catch {
    /* headers() unavailable in this context — fall through to the site URL */
  }
  return siteUrl();
}
