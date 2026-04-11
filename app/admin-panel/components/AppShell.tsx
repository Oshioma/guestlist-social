"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { label: "Dashboard", href: "/app/dashboard" },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      {/* Sidebar */}
      <aside
        style={{
          width: 240,
          background: "#18181b",
          color: "#fff",
          padding: "24px 0",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
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
          <div style={{ fontSize: 11, fontWeight: 400, color: "#a1a1aa", marginTop: 2 }}>
            Admin
          </div>
        </div>

        <nav style={{ display: "flex", flexDirection: "column", gap: 2, padding: "0 8px" }}>
          {navItems.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
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
                  transition: "background 0.15s, color 0.15s",
                }}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div style={{ marginTop: "auto", padding: "16px 20px" }}>
          <Link
            href="/"
            style={{
              fontSize: 12,
              color: "#71717a",
              textDecoration: "none",
            }}
          >
            &larr; Back to site
          </Link>
        </div>
      </aside>

      {/* Main content */}
      <main style={{ flex: 1, overflow: "auto" }}>{children}</main>
    </div>
  );
}
