// Standalone Proofer surface at /proofer. It reuses the admin panel's stylesheet
// and the same ProoferBoard component, but wraps it in its own lightweight
// chrome instead of the full admin AppShell — so Proofer reads as its own site
// while every board behaviour (media, Instagram/Facebook publishing, statuses,
// comments, ideas) stays byte-for-byte the same code as /app/proofer.
import "../admin-panel/admin.css";
import { redirect } from "next/navigation";
import MetaSdkLoader from "../admin-panel/components/MetaSdkLoader";
import ProoferNav from "./ProoferNav";
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
        <ProoferNav />
        <main style={{ flex: 1, minWidth: 0, padding: 24 }}>{children}</main>
      </div>
    </>
  );
}
