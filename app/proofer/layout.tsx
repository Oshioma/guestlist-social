// Standalone Proofer surface at /proofer. It reuses the admin panel's stylesheet
// and the same ProoferBoard component, but wraps it in its own lightweight
// chrome instead of the full admin AppShell — so Proofer reads as its own site
// while every board behaviour (media, Instagram/Facebook publishing, statuses,
// comments, ideas) stays byte-for-byte the same code as /app/proofer. The top
// nav is rendered by the page (it needs the client/month selection); this
// layout provides the shell and auth.
import type { Metadata } from "next";
import "../admin-panel/admin.css";
import Link from "next/link";
import { redirect } from "next/navigation";
import MetaSdkLoader from "../admin-panel/components/MetaSdkLoader";
import { getProoferAccess } from "@/lib/auth/permissions";
import { getProoferBase } from "./base";

// Give the Proofer surface its own "P" browser-tab icon so it reads as its own
// product. This must be a static /public asset rather than a route-segment
// icon.tsx: the standalone Proofer host (postproofer.com) redirects every
// /proofer/* URL to its clean path (see middleware.ts), which would break a
// generated /proofer/icon route — whereas /proofer-icon.svg is excluded from
// the middleware matcher and served as-is on every host. Setting `icons` here
// also replaces the site-wide app/icon.jpg for Proofer pages.
export const metadata: Metadata = {
  icons: {
    icon: { url: "/proofer-icon.svg", type: "image/svg+xml" },
  },
};

export default async function ProoferStandaloneLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { base } = await getProoferBase();
  const access = await getProoferAccess();
  if (!access) {
    redirect(`/sign-in?next=${encodeURIComponent(base || "/")}`);
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
            gap: 14,
            fontSize: 12.5,
          }}
        >
          <Link href="/pricing" target="_blank" style={footerLinkStyle}>
            Pricing
          </Link>
          <span style={{ color: "#d4d4d8" }}>·</span>
          <Link href="/privacy" target="_blank" style={footerLinkStyle}>
            Privacy Policy
          </Link>
          <span style={{ color: "#d4d4d8" }}>·</span>
          <Link href="/terms" target="_blank" style={footerLinkStyle}>
            Terms &amp; Conditions
          </Link>
          <span style={{ color: "#d4d4d8" }}>·</span>
          <Link href="/data-deletion" target="_blank" style={footerLinkStyle}>
            Data Deletion
          </Link>
        </footer>
      </div>
    </>
  );
}

const footerLinkStyle: React.CSSProperties = {
  color: "#71717a",
  fontWeight: 600,
  textDecoration: "none",
};
