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

type ConnectedAccount = { platform: string; accountId: string; accountName: string };

type MetaResult =
  | { status: "success"; platforms: string[]; accounts: ConnectedAccount[] }
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

  // Load the tour account's current Meta connections ONCE, on every load — not
  // just on the OAuth round-trip. A Meta login can attach a whole portfolio, and
  // the user must narrow it to one brand. That "pick one" list previously lived
  // only in memory (seeded from the ?fromconnect= render), so a mobile same-tab
  // return that later re-rendered without the query param lost it — and the
  // resume, seeing an account already exists, skipped straight to the composer
  // with all the accounts still attached. Reading it here makes the pending pick
  // survive any reload/remount.
  let connectedAccounts: ConnectedAccount[] = [];
  let pendingPick = false;
  if (state.accountClientId) {
    const admin = createAdminClient();
    const { data } = await admin
      .from("connected_meta_accounts")
      .select("platform, account_id, account_name, access_token")
      .eq("client_id", state.accountClientId);
    connectedAccounts = (data ?? []).map((r) => ({
      platform: String(r.platform),
      accountId: String(r.account_id),
      accountName: String(r.account_name ?? r.account_id),
    }));
    // A pick is still pending when the login attached more than one brand's
    // worth of accounts. Brands are grouped by their shared Page access token
    // (an Instagram account and its parent Facebook Page share one), so an
    // IG+FB pair for a single brand is one brand, not two. Choosing a brand
    // deletes the other tokens' rows, collapsing this back to a single token.
    const brands = new Set(
      (data ?? []).map(
        (r) => (r.access_token as string) ?? `${r.platform}:${r.account_id}`
      )
    );
    pendingPick = brands.size > 1;
  }

  // Parse the Meta OAuth round-trip outcome (mirrors the publish page).
  let metaResult: MetaResult = null;
  const metaError = first(sp.meta_error);
  const metaFlag = first(sp.meta);
  if (metaError) {
    metaResult = { status: "error", message: metaError };
  } else if (metaFlag === "connected" || first(sp.fromconnect) === "1") {
    const platforms = Array.from(new Set(connectedAccounts.map((a) => a.platform)));
    metaResult = { status: "success", platforms, accounts: connectedAccounts };
  }

  const todayISO = new Date().toISOString().slice(0, 10);

  return (
    <OnboardingFlow
      base={base}
      accountClientId={state.accountClientId}
      // An explicit restart begins cleanly at the start of the flow.
      initialStep={start ? 0 : state.step}
      // ?start=1 only ever comes from a board CTA that already showed the
      // welcome invitation ("Let's create your first post" + Let's go). Showing
      // onboarding's own welcome screen next would repeat it, so skip straight
      // to the first real step. Staff previewing the tour (demo) still see it.
      autoStart={start}
      demo={demo}
      metaResult={metaResult}
      // Re-surface a still-pending multi-account pick on any load (not demo).
      initialConnectedAccounts={demo ? [] : connectedAccounts}
      pendingPick={demo ? false : pendingPick}
      todayISO={todayISO}
    />
  );
}
