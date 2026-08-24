import "./admin.css";
import { redirect } from "next/navigation";
import AppShell from "./components/AppShell";
import MetaSdkLoader from "./components/MetaSdkLoader";
import FailureRecorder from "./components/FailureRecorder";
import { getMemberAccess } from "@/lib/auth/permissions";

export default async function AdminPanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const access = await getMemberAccess();
  if (!access) {
    redirect("/sign-in?next=/app");
  }

  return (
    <>
      <MetaSdkLoader />
      <AppShell
        isAdmin={access.role === "admin"}
        canRunAds={access.canRunAds}
        buildSha={(process.env.VERCEL_GIT_COMMIT_SHA ?? "local").slice(0, 7)}
      >
        <FailureRecorder />
        {children}
      </AppShell>
    </>
  );
}
