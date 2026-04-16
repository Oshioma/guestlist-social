"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = { label: string; href: string };
type NavGroup = { heading: string; items: NavItem[] };

const navGroups: NavGroup[] = [
  {
    heading: "",
    items: [
      { label: "Dashboard", href: "/app/dashboard" },
      { label: "Clients", href: "/app/clients" },
    ],
  },
  {
    heading: "Engine",
    items: [
      { label: "Meta queue", href: "/app/meta-queue" },
      { label: "Playbook", href: "/app/whats-working" },
      { label: "Creative library", href: "/app/creative" },
      { label: "Reports", href: "/app/reports" },
      { label: "Memory", href: "/app/memory" },
    ],
  },
  {
    heading: "Publisher",
    items: [
      { label: "Proofer", href: "/app/proofer" },
      { label: "Publish queue", href: "/app/proofer/publish" },
      { label: "Ideas", href: "/app/ideas" },
      { label: "Content", href: "/app/content" },
    ],
  },
  {
    heading: "Campaigns",
    items: [
      { label: "Quick launch", href: "/app/launch" },
    ],
  },
];

const utilityItems: NavItem[] = [
  { label: "Tasks", href: "/app/tasks" },
  { label: "Settings", href: "/app/settings" },
  { label: "Guide", href: "/app/guide" },
];

const externalItems: NavItem[] = [
  { label: "Client view", href: "/portal" },
];

export default function Sidebar() {
  const pathname = usePathname();

  function isActive(href: string): boolean {
    if (href === "/app/dashboard") return pathname === "/app/dashboard";
    return pathname === href || pathname.startsWith(href + "/");
  }

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
        {navGroups.map((group, gi) => (
          <div key={gi}>
            {group.heading && (
              <div style={groupHeadingStyle}>{group.heading}</div>
            )}
            {group.items.map((item) => (
              <NavLink
                key={item.href}
                item={item}
                active={isActive(item.href)}
              />
            ))}
          </div>
        ))}

        <div style={groupHeadingStyle}>Utility</div>
        {utilityItems.map((item) => (
          <NavLink
            key={item.href}
            item={item}
            active={isActive(item.href)}
          />
        ))}

        <div style={groupHeadingStyle}>Other views</div>
        {externalItems.map((item) => (
          <NavLink
            key={item.href}
            item={item}
            active={isActive(item.href)}
          />
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

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
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
}

const groupHeadingStyle: React.CSSProperties = {
  margin: "14px 8px 4px",
  paddingTop: 10,
  borderTop: "1px solid rgba(255,255,255,0.08)",
  fontSize: 10,
  color: "#71717a",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  fontWeight: 600,
};
