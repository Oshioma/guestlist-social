// ---------------------------------------------------------------------------
// Portal root layout.
//
// Anything under /portal goes through this. Two jobs:
//   1. Require a logged-in user (middleware also enforces, but we re-check
//      here so a misconfigured matcher can't accidentally leak content).
//   2. Stamp the portal CSS so the calmer palette wins over the global one.
//
// Per-client navigation lives in /portal/[clientId]/layout.tsx — this layout
// only owns the body background and the auth gate.
// ---------------------------------------------------------------------------

import "./portal.css";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getViewer } from "../admin-panel/lib/viewer";
import { isProoferHostRequest } from "./[clientId]/visibility";

// Clients invited from Post Proofer use the portal on that domain, so there it
// carries Post Proofer's tab title and "P" icon instead of the agency site's.
export async function generateMetadata(): Promise<Metadata> {
  if (!(await isProoferHostRequest())) return {};
  return {
    title: "Client portal — Post Proofer",
    icons: { icon: { url: "/proofer-icon.svg", type: "image/svg+xml" } },
  };
}

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const viewer = await getViewer();
  if (!viewer) {
    redirect("/sign-in?next=/portal");
  }

  return <div className="portal-root">{children}</div>;
}
