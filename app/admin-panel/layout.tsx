import "./admin.css";
import AppShell from "./components/AppShell";
import MetaSdkLoader from "./components/MetaSdkLoader";
import { requireAdminPanelAccess } from "./lib/auth";

export default async function AdminPanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdminPanelAccess(["admin", "operator", "viewer"]);

  return (
    <>
      <MetaSdkLoader />
      <AppShell>{children}</AppShell>
    </>
  );
}
