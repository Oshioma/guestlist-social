"use client";

// Tab bar for the Sales section. Real links (not local state) so each tab is
// its own route and can be linked to / refreshed directly.

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { label: "Weekly activity", href: "/app/sales" },
  { label: "Opportunities", href: "/app/sales/opportunities" },
];

export default function SalesTabs() {
  const pathname = usePathname();

  return (
    <div
      style={{
        display: "inline-flex",
        gap: 8,
        padding: 6,
        border: "1px solid rgba(16,24,40,0.08)",
        borderRadius: 14,
        background: "rgba(255,255,255,0.72)",
        alignSelf: "flex-start",
        flexWrap: "wrap",
      }}
    >
      {TABS.map((tab) => {
        const isActive =
          tab.href === "/app/sales"
            ? pathname === "/app/sales"
            : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            style={{
              padding: "9px 14px",
              fontSize: 13,
              fontWeight: 600,
              color: isActive ? "#101828" : "#667085",
              background: isActive ? "#ffffff" : "transparent",
              border: isActive
                ? "1px solid rgba(16,24,40,0.10)"
                : "1px solid transparent",
              borderRadius: 999,
              textDecoration: "none",
              boxShadow: isActive ? "0 2px 10px rgba(16,24,40,0.06)" : "none",
            }}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
