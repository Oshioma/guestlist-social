// ---------------------------------------------------------------------------
// /login — server-side redirect to the external auth provider.
//
// When a user (or the middleware) lands here they are immediately bounced to
// the hotname.co.uk sign-in page.  The `returnTo` param tells the provider
// where to send the user once they have authenticated; it must point at our
// /auth/callback route so we can capture the token and set the session cookie.
//
// Nothing is rendered in the browser — the redirect happens before React
// hydrates, so there is no flash of content.
// ---------------------------------------------------------------------------

import { redirect } from "next/navigation";

// Base URL for this app — set NEXT_PUBLIC_APP_URL in your environment so
// the returnTo URL is correct across dev / staging / production.
// e.g. NEXT_PUBLIC_APP_URL=https://your-production-domain.com
const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? "https://that-site.com";

// The URL the auth provider will send the user back to after sign-in.
const CALLBACK_URL = `${APP_URL}/auth/callback`;

// Full sign-in URL — the provider reads `app` to choose the correct
// branding / permissions set and `returnTo` to know where to redirect.
const SIGN_IN_URL =
  `https://hotname.co.uk/sign-in?app=guestlist&returnTo=${encodeURIComponent(CALLBACK_URL)}`;

export default function LoginPage() {
  // `redirect` throws internally so no JSX is needed here.
  redirect(SIGN_IN_URL);
}
