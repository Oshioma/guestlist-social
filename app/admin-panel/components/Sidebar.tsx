"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

type NavItem = { label: string; href: string };
type NavGroup = {
  heading: string;
  items: NavItem[];
  collapsible?: boolean;
  headingHref?: string;
};

type Props = {
  isAdmin: boolean;
  canRunAds: boolean;
};

const ENGINE_ITEMS: NavItem[] = [
  { label: "Meta queue", href: "/app/meta-queue" },
  { label: "Playbook", href: "/app/whats-working" },
  { label: "Creative library", href: "/app/creative" },
  { label: "Reports", href: "/app/reports" },
  { label: "Memory", href: "/app/memory" },
];

const PUBLISHER_ITEMS: NavItem[] = [
  { label: "Proofer", href: "/app/proofer" },
  { label: "Ideas", href: "/app/ideas" },
];

function buildNavGroups(canRunAds: boolean): NavGroup[] {
  const groups: NavGroup[] = [
    {
      heading: "",
      items: [
        { label: "Dashboard", href: "/app/dashboard" },
        { label: "Content Dashboard", href: "/app/content" },
        { label: "Clients", href: "/app/clients" },
      ],
    },
    { heading: "Publisher", items: PUBLISHER_ITEMS, collapsible: true },
    { heading: "Engine", items: ENGINE_ITEMS, collapsible: true },
    { heading: "Tasks", items: [], headingHref: "/app/tasks" },
  ];

  return groups;
}

function buildUtilityItems(isAdmin: boolean): NavItem[] {
  const items: NavItem[] = [];
  if (isAdmin) {
    items.push({ label: "Members", href: "/app/settings/members" });
  }
  items.push({ label: "Settings", href: "/app/settings" });
  items.push({ label: "Guide", href: "/app/guide" });
  return items;
}

const externalItems: NavItem[] = [{ label: "Client view", href: "/portal" }];

export default function Sidebar({ isAdmin, canRunAds }: Props) {
  const pathname = usePathname();
  const navGroups = buildNavGroups(canRunAds);
  const utilityItems = buildUtilityItems(isAdmin);

  function isActive(href: string): boolean {
    if (href === "/app/dashboard") return pathname === "/app/dashboard";
    if (href === "/app/content") {
      return pathname === "/app/content" || pathname.startsWith("/app/content/");
    }
    return pathname === href || pathname.startsWith(href + "/");
  }

  function groupHasActive(items: NavItem[]): boolean {
    return items.some((i) => isActive(i.href));
  }

  return (
    <aside className="app-sidebar">
      <div className="app-sidebar-brand">
        <img
          src="/gslogo.jpg"
          alt="Guestlist Social"
          className="app-sidebar-brand-logo"
          width={22}
          height={22}
        />
        <div>
          <div className="app-sidebar-brand-title">Guestlist Social</div>
          <div className="app-sidebar-brand-subtitle">Vibing!</div>
        </div>
      </div>

      <nav className="app-sidebar-nav">
        {navGroups.map((group, gi) => (
          <NavSection
            key={gi}
            group={group}
            isActive={isActive}
            defaultOpen={
              !group.collapsible ||
              group.heading === "Campaigns" ||
              groupHasActive(group.items)
            }
          />
        ))}

        <NavSection
          group={{ heading: "Utility", items: utilityItems }}
          isActive={isActive}
          defaultOpen
        />

        <NavSection
          group={{ heading: "Other views", items: externalItems }}
          isActive={isActive}
          defaultOpen
        />
      </nav>

      <div className="app-sidebar-footer">
        <Link href="/" className="app-sidebar-backlink">
          &larr; Back to site
        </Link>
      </div>
    </aside>
  );
}

function NavSection({
  group,
  isActive,
  defaultOpen,
}: {
  group: NavGroup;
  isActive: (href: string) => boolean;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const collapsible = !!group.collapsible;
  const headingHref = group.headingHref;

  return (
    <div className="app-sidebar-section">
      {group.heading &&
        (collapsible ? (
          <button
            type="button"
            className="app-sidebar-heading app-sidebar-heading-button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
          >
            <span>{group.heading}</span>
            <span
              className="app-sidebar-chevron"
              style={{ transform: open ? "rotate(90deg)" : "rotate(0deg)" }}
            >
              ›
            </span>
          </button>
        ) : headingHref ? (
          <Link
            href={headingHref}
            className={`app-sidebar-heading app-sidebar-heading-link${
              isActive(headingHref) ? " app-sidebar-heading-link-active" : ""
            }`}
          >
            {group.heading}
          </Link>
        ) : (
          <div className="app-sidebar-heading">{group.heading}</div>
        ))}
      {(!collapsible || open) &&
        group.items.map((item) => (
          <NavLink
            key={item.href}
            item={item}
            active={isActive(item.href)}
            indented={collapsible}
          />
        ))}
    </div>
  );
}

function NavLink({
  item,
  active,
  indented,
}: {
  item: NavItem;
  active: boolean;
  indented?: boolean;
}) {
  return (
    <Link
      href={item.href}
      className={`app-sidebar-link${active ? " app-sidebar-link-active" : ""}${indented ? " app-sidebar-link-indented" : ""}`}
    >
      {item.label}
    </Link>
  );
}
