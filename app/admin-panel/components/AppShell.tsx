"use client";

import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";

type Props = {
  children: React.ReactNode;
  isAdmin: boolean;
  canRunAds: boolean;
};

export default function AppShell({ children, isAdmin, canRunAds }: Props) {
  const pathname = usePathname();
  const isInteractionRoute =
    pathname.startsWith("/app/interaction") ||
    pathname.startsWith("/admin-panel/interaction");

  if (isInteractionRoute) {
    return (
      <div className="app-main">
        <main style={{ flex: 1, padding: 0 }}>{children}</main>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <Sidebar isAdmin={isAdmin} canRunAds={canRunAds} />
      <div className="app-main">
        <Topbar />
        <main style={{ flex: 1, padding: 24 }}>{children}</main>
      </div>
    </div>
  );
}
