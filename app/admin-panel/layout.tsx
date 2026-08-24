import "./admin.css";
import { redirect } from "next/navigation";
import { after } from "next/server";
import AppShell from "./components/AppShell";
import MetaSdkLoader from "./components/MetaSdkLoader";
import FailureRecorder from "./components/FailureRecorder";
import { getMemberAccess } from "@/lib/auth/permissions";
import { maybeSendDailyReport } from "@/lib/admin/daily-report";

export default async function AdminPanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const access = await getMemberAccess();
  if (!access) {
    redirect("/sign-in?next=/app");
  }

  // Cron-free daily report: the first admin-panel page load of each day
  // (agency timezone) triggers the admin email digest. Runs after the
  // response is sent, so page loads never wait on it; every later load the
  // same day is a single cheap settings read.
  after(() => maybeSendDailyReport());

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
