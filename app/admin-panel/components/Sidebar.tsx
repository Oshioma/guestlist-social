"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { label: "Dashboard", href: "/app/dashboard" },
  { label: "Clients", href: "/app/clients" },
  { label: "Playbook", href: "/app/whats-working" },
  { label: "Content", href: "/app/content" },
  { label: "Video Ideas", href: "/app/video-ideas" },
  { label: "Carousel Ideas", href: "/app/carousel-ideas" },
  { label: "Story Ideas", href: "/app/story-ideas" },
  { label: "Tasks", href: "/app/tasks" },
  { label: "Launch", href: "/app/launch" },
  { label: "Reports", href: "/app/reports" },
  { label: "Memory", href: "/app/memory" },
  { label: "Settings", href: "/app/settings" },
  { label: "Guide", href: "/app/guide" },
  { label: "About", href: "/app/about" },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="app-sidebar">
      <div
        className="app-sidebar-brand"
        style={{
          padding: "0 20px 20px",
          fontSize: 14,
          fontWeight: 600,
          letterSpacing: "0.04em",
          borderBottom: "1px solid rgba(255,255,255,0.1)",
          marginBottom: 12,
        }}
      >
        Guestlist Social
        <div
          style={{
            fontSize: 11,
            fontWeight: 400,
            color: "#a1a1aa",
            marginTop: 2,
          }}
        >
          Ad Ops
        </div>
      </div>

      <nav className="app-sidebar-nav">
        {navItems.map((item) => {
          const active =
            pathname === item.href ||
            (item.href !== "/app/dashboard" &&
              pathname.startsWith(item.href + "/")) ||
            (item.href === "/app/dashboard" &&
              pathname === "/app/dashboard");
          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                display: "block",
                padding: "8px 12px",
                borderRadius: 6,
                fontSize: 14,
                color: active ? "#fff" : "#a1a1aa",
                background: active ? "rgba(255,255,255,0.1)" : "transparent",
                textDecoration: "none",
                whiteSpace: "nowrap",
              }}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="app-sidebar-footer" style={{ padding: "16px 20px" }}>
        <Link
          href="/"
          style={{ fontSize: 12, color: "#71717a", textDecoration: "none" }}
        >
          &larr; Back to site
        </Link>
      </div>
    </aside>
  );
}
