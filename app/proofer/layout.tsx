// Standalone Proofer surface at /proofer. It reuses the admin panel's stylesheet
// and the same ProoferBoard component, but wraps it in its own lightweight
// chrome instead of the full admin AppShell — so Proofer reads as its own site
// while every board behaviour (media, Instagram/Facebook publishing, statuses,
// comments, ideas) stays byte-for-byte the same code as /app/proofer. The top
// nav is rendered by the page (it needs the client/month selection); this
// layout provides the shell, auth and the footer link back to the dashboard.
import "../admin-panel/admin.css";
import Link from "next/link";
import { redirect } from "next/navigation";
import MetaSdkLoader from "../admin-panel/components/MetaSdkLoader";
import { getMemberAccess } from "@/lib/auth/permissions";

export default async function ProoferStandaloneLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const access = await getMemberAccess();
  if (!access) {
    redirect("/sign-in?next=/proofer");
  }

  return (
    <>
      <MetaSdkLoader />
      <div
        className="admin-root"
        style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}
      >
        {children}
        <footer
          style={{
            flexShrink: 0,
            borderTop: "1px solid #e4e4e7",
            padding: "16px 24px",
            display: "flex",
            justifyContent: "center",
          }}
        >
          <Link
            href="/app/dashboard"
            target="_blank"
            rel="noopener"
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "#52525b",
              textDecoration: "none",
            }}
          >
            ← Guestlist Dashboard ↗
          </Link>
        </footer>
      </div>
    </>
  );
}
