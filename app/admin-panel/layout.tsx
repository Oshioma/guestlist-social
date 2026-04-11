import "./admin.css";
import AppShell from "./components/AppShell";
import { requireAdminPanelAccess } from "./lib/auth";

export default async function AdminPanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdminPanelAccess(["admin", "operator", "viewer"]);

  return <AppShell>{children}</AppShell>;
}
