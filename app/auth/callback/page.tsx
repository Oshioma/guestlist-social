// ---------------------------------------------------------------------------
// /auth/callback — captures the token returned by the external auth provider.
//
// Flow:
//   1. hotname.co.uk redirects the browser here after sign-in, appending a
//      `token` query parameter (e.g. /auth/callback?token=abc123).
//   2. This page reads that token from the URL.
//   3. It stores the token in a first-party cookie so the Next.js middleware
//      can verify it on subsequent requests.
//   4. It then redirects the user to the app root ("/").
//
// This must be a Client Component because we need access to the browser URL
// (window.location.search) before the first render, and we use useEffect to
// trigger the cookie write + redirect imperatively.
// ---------------------------------------------------------------------------

"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Cookie TTL — 24 hours in seconds.
const MAX_AGE_SECONDS = 60 * 60 * 24;

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    // Read the token from the query string.
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");

    if (!token) {
      // No token provided — send the user back to /login so they can restart
      // the sign-in flow.  Redirecting to "/" without a token would create an
      // immediate redirect loop: / → middleware → /login → provider → /auth/callback → / → …
      router.replace("/login");
      return;
    }

    // Persist the token as a cookie so middleware can read it server-side.
    // `Secure` is set whenever the page is loaded over HTTPS so the cookie is
    // never transmitted over plain HTTP in production.
    const isSecure = window.location.protocol === "https:";
    const cookieParts = [
      `token=${encodeURIComponent(token)}`,
      `path=/`,
      `max-age=${MAX_AGE_SECONDS}`,
      `SameSite=Lax`,
    ];
    if (isSecure) cookieParts.push("Secure");
    document.cookie = cookieParts.join("; ");

    // Token saved — send the user to the app root.
    router.replace("/");
  }, [router]);

  // Minimal UI shown while the redirect is in progress.
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background: "#f4f4f5",
        fontFamily: "system-ui, sans-serif",
        color: "#71717a",
        fontSize: 14,
      }}
    >
      Authenticating…
    </div>
  );
}
