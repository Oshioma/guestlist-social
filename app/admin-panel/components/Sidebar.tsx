"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { label: "Dashboard", href: "/app/dashboard" },
  { label: "Clients", href: "/app/clients" },
  { label: "Creative", href: "/app/creative" },
  { label: "Playbook", href: "/app/whats-working" },
  { label: "Content", href: "/app/content" },
  { label: "Video Ideas", href: "/app/video-ideas" },
  { label: "Carousel Ideas", href: "/app/carousel-ideas" },
  { label: "Story Ideas", href: "/app/story-ideas" },
  { label: "Tasks", href: "/app/tasks" },
  { label: "Launch", href: "/app/launch" },
  { label: "Meta queue", href: "/app/meta-queue" },
  { label: "Reports", href: "/app/reports" },
  { label: "Memory", href: "/app/memory" },
  { label: "Settings", href: "/app/settings" },
  { label: "Guide", href: "/app/guide" },
  { label: "About", href: "/app/about" },
];

// Anything in this list points outside /app/* — typically into another shell
// (the portal lives at /portal). They render below the main nav with a
// divider so they're visually separated from the operator's day-to-day items.
const externalNavItems = [
  { label: "Client view", href: "/portal" },
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

        {/* External shells — divider, then a labelled section. */}
        <div
          style={{
            margin: "12px 8px 6px",
            paddingTop: 12,
            borderTop: "1px solid rgba(255,255,255,0.08)",
            fontSize: 10,
            color: "#71717a",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
          }}
        >
          Other views
        </div>
        {externalNavItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            style={{
              display: "block",
              padding: "8px 12px",
              borderRadius: 6,
              fontSize: 14,
              color: "#a1a1aa",
              background: "transparent",
              textDecoration: "none",
              whiteSpace: "nowrap",
            }}
          >
            {item.label}
          </Link>
        ))}
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
