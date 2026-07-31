"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";

type Props = {
  children: React.ReactNode;
  isAdmin: boolean;
  canRunAds: boolean;
};

export default function AppShell({ children, isAdmin, canRunAds }: Props) {
  // Below 1100px the sidebar is an off-canvas drawer. Above it, this state is
  // inert — the sidebar is always visible and the trigger is hidden by CSS.
  const [navOpen, setNavOpen] = useState(false);
  const pathname = usePathname();

  // Navigating away should never leave the drawer sitting open over the page.
  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!navOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setNavOpen(false);
    };
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [navOpen]);

  return (
    // admin-root carries the admin panel's typography and background. It has
    // to sit on a real element — the class existed in admin.css but nothing
    // ever used it, so its font stack was never applied.
    <div className="admin-root app-shell">
      <Sidebar
        isAdmin={isAdmin}
        canRunAds={canRunAds}
        open={navOpen}
        onClose={() => setNavOpen(false)}
      />
      {navOpen && (
        <div
          className="app-nav-backdrop"
          onClick={() => setNavOpen(false)}
          aria-hidden
        />
      )}
      <div className="app-main">
        <Topbar onMenu={() => setNavOpen(true)} />
        <main className="app-content">{children}</main>
      </div>
    </div>
  );
}
