import { redirect } from "next/navigation";
import { getProoferAccess } from "@/lib/auth/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProoferBase } from "../base";
import { getOnboardingState } from "@/lib/onboarding";
import OnboardingFlow from "./OnboardingFlow";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Get started · PostProofer",
};

type MetaResult =
  | { status: "success"; platforms: string[] }
  | { status: "error"; message: string }
  | null;

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const access = await getProoferAccess();
  const { base } = await getProoferBase();
  if (!access) {
    redirect(`/sign-in?next=${encodeURIComponent(`${base}/onboarding`)}`);
  }

  const sp = await searchParams;
  const first = (v: string | string[] | undefined) =>
    Array.isArray(v) ? v[0] : v;

  const replay = first(sp.replay) === "1";
  // Explicit (re)start intent — e.g. the board's "Start guided setup" CTA. This
  // runs the REAL flow and must override a stale "completed" flag, otherwise a
  // user who finished once but has no account is stuck (the guard below would
  // bounce them straight back to the empty board).
  const start = first(sp.start) === "1";
  // Only posters run the real tour; staff can still preview it in replay mode.
  const demo = replay || access.kind === "staff";

  const state = await getOnboardingState(access.userId);

  // Already finished → send them to their board. But NOT when they explicitly
  // asked to (re)start or replay, and never when they somehow completed without
  // ever getting an account (a broken state they need onboarding to fix).
  if (state.completed && !replay && !start && state.accountClientId) {
    redirect(base || "/");
  }

  // Parse the Meta OAuth round-trip outcome (mirrors the publish page).
  let metaResult: MetaResult = null;
  const metaError = first(sp.meta_error);
  const metaFlag = first(sp.meta);
  if (metaError) {
    metaResult = { status: "error", message: metaError };
  } else if (metaFlag === "connected" || first(sp.fromconnect) === "1") {
    let platforms: string[] = [];
    if (state.accountClientId) {
      const admin = createAdminClient();
      const { data } = await admin
        .from("connected_meta_accounts")
        .select("platform")
        .eq("client_id", state.accountClientId);
      platforms = Array.from(new Set((data ?? []).map((r) => String(r.platform))));
    }
    metaResult = { status: "success", platforms };
  }

  const todayISO = new Date().toISOString().slice(0, 10);

  return (
    <OnboardingFlow
      base={base}
      accountClientId={state.accountClientId}
      // An explicit restart begins cleanly at the welcome screen.
      initialStep={start ? 0 : state.step}
      demo={demo}
      metaResult={metaResult}
      todayISO={todayISO}
    />
  );
}
