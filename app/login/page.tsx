// This site does not own the sign-in UI — it lives on the central auth app.
// Redirect immediately; if the user already has active access, send to dashboard.
import { redirect } from "next/navigation";
import { getMembership } from "@/lib/auth/membership";

export default async function LoginPage() {
  const { authenticated, hasAccess } = await getMembership();

  if (authenticated && hasAccess) {
    redirect("/dashboard");
  }

  const authAppUrl =
    process.env.NEXT_PUBLIC_AUTH_APP_URL ?? "https://hotname.co.uk";
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3001";

  const appKey = process.env.SITE_APP_KEY ?? "guestlist";
  const signInUrl = `${authAppUrl}/sign-in?app=${appKey}&returnTo=${siteUrl}/auth/callback`;

  redirect(signInUrl);
}
