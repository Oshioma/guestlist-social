// Protected dashboard. Requires an active guestlist app membership.
import { redirect } from "next/navigation";
import { getMembership } from "@/lib/auth/membership";

export default async function DashboardPage() {
  const { authenticated, hasAccess, role, user } = await getMembership();

  if (!authenticated) {
    redirect("/login");
  }

  if (!hasAccess) {
    return (
      <main style={{ padding: "2rem" }}>
        <h1>No access</h1>
        <p>
          Your account does not have an active membership for this app.
        </p>
      </main>
    );
  }

  return (
    <main style={{ padding: "2rem" }}>
      <h1>Dashboard</h1>
      <p>App: {process.env.SITE_APP_KEY ?? "guestlist"}</p>
      <p>Signed in as: {user?.email}</p>
      <p>Role: {role ?? "—"}</p>
    </main>
  );
}
