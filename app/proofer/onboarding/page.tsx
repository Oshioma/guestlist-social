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
  // Only posters run the real tour; staff can still preview it in replay mode.
  const demo = replay || access.kind === "staff";

  const state = await getOnboardingState(access.userId);

  // Already finished and not replaying → send them to their board.
  if (state.completed && !replay) {
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
      initialStep={state.step}
      demo={demo}
      metaResult={metaResult}
      todayISO={todayISO}
    />
  );
}
