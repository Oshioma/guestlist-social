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
import { redirect } from "next/navigation";
import { getViewer } from "../admin-panel/lib/viewer";

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
