"use client";

// ---------------------------------------------------------------------------
// Portal sidebar — three nav items, no overflow.
//
// We deliberately do *not* mirror the admin sidebar. The portal exposes only
// the trust surfaces: Dashboard (top priorities), Ads (audit trails), Reviews
// (sent narratives). Everything else — content tools, launches, settings — is
// admin-only.
// ---------------------------------------------------------------------------

import Link from "next/link";
import { usePathname } from "next/navigation";

type Props = {
  clientId: number;
  clientName: string;
  isAdminPreview: boolean;
};

export default function PortalSidebar({
  clientId,
  clientName,
  isAdminPreview,
}: Props) {
  const pathname = usePathname();
  const base = `/portal/${clientId}`;

  const navItems = [
    { label: "Dashboard", href: `${base}` },
    { label: "Ads", href: `${base}/ads` },
    { label: "Reviews", href: `${base}/reviews` },
  ];

  return (
    <aside className="portal-sidebar">
      <div
        style={{
          padding: "0 20px 20px",
          borderBottom: "1px solid rgba(255,255,255,0.1)",
          marginBottom: 12,
        }}
      >
        <div
          style={{
            fontSize: 11,
            color: "#94a3b8",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
          }}
        >
          Client portal
        </div>
        <div
          style={{
            fontSize: 16,
            fontWeight: 700,
            marginTop: 4,
            color: "#fff",
          }}
        >
          {clientName}
        </div>
        {isAdminPreview && (
          <div
            style={{
              marginTop: 8,
              fontSize: 10,
              padding: "3px 8px",
              borderRadius: 999,
              background: "rgba(251, 191, 36, 0.2)",
              color: "#fde68a",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              display: "inline-block",
            }}
          >
            Admin preview
          </div>
        )}
      </div>

      <nav className="portal-sidebar-nav">
        {navItems.map((item) => {
          const active =
            pathname === item.href ||
            (item.href !== base && pathname.startsWith(item.href + "/")) ||
            (item.href === base && pathname === base);
          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                display: "block",
                padding: "8px 12px",
                borderRadius: 6,
                fontSize: 14,
                color: active ? "#fff" : "#94a3b8",
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

      <div style={{ padding: "16px 20px" }}>
        {isAdminPreview ? (
          <Link
            href="/portal"
            style={{
              fontSize: 12,
              color: "#94a3b8",
              textDecoration: "none",
              display: "block",
            }}
          >
            ← Switch client
          </Link>
        ) : (
          <Link
            href="/login"
            style={{
              fontSize: 12,
              color: "#94a3b8",
              textDecoration: "none",
            }}
          >
            Sign out
          </Link>
        )}
      </div>
    </aside>
  );
}
