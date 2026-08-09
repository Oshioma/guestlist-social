// Standalone Proofer surface at /proofer. It reuses the admin panel's stylesheet
// and the same ProoferBoard component, but wraps it in its own lightweight
// chrome instead of the full admin AppShell — so Proofer reads as its own site
// while every board behaviour (media, Instagram/Facebook publishing, statuses,
// comments, ideas) stays byte-for-byte the same code as /app/proofer. The top
// nav is rendered by the page (it needs the client/month selection); this
// layout provides the shell and auth.
import type { Metadata } from "next";
import "../admin-panel/admin.css";
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
      </div>
    </>
  );
}
