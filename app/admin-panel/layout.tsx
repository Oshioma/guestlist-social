import "./admin.css";
import { redirect } from "next/navigation";
import AppShell from "./components/AppShell";
import MetaSdkLoader from "./components/MetaSdkLoader";
import { getMemberAccess } from "@/lib/auth/permissions";

export default async function AdminPanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const access = await getMemberAccess();
  if (!access) {
    redirect("/sign-in?next=/app");
  }

  return (
    <>
      <MetaSdkLoader />
      <AppShell isAdmin={access.role === "admin"} canRunAds={access.canRunAds}>
        {children}
      </AppShell>
    </>
  );
}
