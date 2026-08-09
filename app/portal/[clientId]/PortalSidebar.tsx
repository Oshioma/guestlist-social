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

type Visibility = {
  content: boolean;
  ads: boolean;
  reviews: boolean;
  consultation: boolean;
};

type Props = {
  clientId: number;
  clientName: string;
  isAdminPreview: boolean;
  visibility?: Visibility;
};

export default function PortalSidebar({
  clientId,
  clientName,
  isAdminPreview,
  visibility,
}: Props) {
  const pathname = usePathname();
  const base = `/portal/${clientId}`;

  // Missing visibility (older callers) means "show everything" — the toggles
  // default on, so this preserves prior behavior.
  const show = {
    content: visibility?.content !== false,
    ads: visibility?.ads !== false,
    reviews: visibility?.reviews !== false,
    consultation: visibility?.consultation !== false,
  };

  const navItems = [
    { label: "Dashboard", href: `${base}`, show: true },
    { label: "Content", href: `${base}/content`, show: show.content },
    { label: "Ads", href: `${base}/ads`, show: show.ads },
    { label: "Reviews", href: `${base}/reviews`, show: show.reviews },
    { label: "Consultation", href: `${base}/consultation`, show: show.consultation },
    { label: "Connect Meta", href: `${base}/connect`, show: true },
  ].filter((item) => item.show);

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
            color: "#b8e3d8",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            fontWeight: 700,
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
              background: "rgba(184, 227, 216, 0.2)",
              color: "#b8e3d8",
              fontWeight: 700,
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
                padding: "9px 13px",
                borderRadius: 9,
                fontSize: 14,
                fontWeight: active ? 700 : 500,
                color: active ? "#fff" : "#a6a6ad",
                background: active ? "rgba(184,227,216,0.18)" : "transparent",
                textDecoration: "none",
                whiteSpace: "nowrap",
              }}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="portal-sidebar-foot" style={{ padding: "16px 20px" }}>
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
          <form action="/sign-out" method="post" style={{ margin: 0 }}>
            <button
              type="submit"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                background: "rgba(255,255,255,0.08)",
                border: "1px solid rgba(255,255,255,0.22)",
                borderRadius: 10,
                padding: "9px 16px",
                fontSize: 14,
                fontWeight: 700,
                color: "#fff",
                cursor: "pointer",
                width: "100%",
                justifyContent: "center",
              }}
            >
              <span aria-hidden style={{ fontSize: 15 }}>↩</span> Sign out
            </button>
          </form>
        )}
      </div>
    </aside>
  );
}
