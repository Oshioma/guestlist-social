"use client";

import Sidebar from "./Sidebar";
import Topbar from "./Topbar";

type Props = {
  children: React.ReactNode;
  isAdmin: boolean;
  canRunAds: boolean;
};

export default function AppShell({ children, isAdmin, canRunAds }: Props) {
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
