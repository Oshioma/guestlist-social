"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ENGINE_TABS = [
  { label: "Meta queue", href: "/app/meta-queue" },
  { label: "Playbook", href: "/app/whats-working" },
  { label: "Creative library", href: "/app/creative" },
  { label: "Reports", href: "/app/reports" },
  { label: "Memory", href: "/app/memory" },
];

export default function EngineNav() {
  const pathname = usePathname();

  return (
    <nav className="app-subnav" aria-label="Engine sections">
      {ENGINE_TABS.map((tab) => {
        const active =
          pathname === tab.href || pathname.startsWith(tab.href + "/");
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`app-subnav-link${active ? " app-subnav-link-active" : ""}`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
