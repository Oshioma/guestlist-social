import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProoferAccess } from "@/lib/auth/permissions";

// The guided first-run tour has a fixed number of steps. Kept here so the
// server (progress persistence, "resume") and the client flow agree on the
// count without duplicating it.
export const ONBOARDING_TOTAL_STEPS = 11;

export type OnboardingState = {
  started: boolean;
  step: number;
  completed: boolean;
  skipped: boolean;
  accountClientId: string | null;
  firstPostId: string | null;
};

const DEFAULT_STATE: OnboardingState = {
  started: false,
  step: 0,
  completed: false,
  skipped: false,
  accountClientId: null,
  firstPostId: null,
};

type Row = {
  onboarding_started: boolean | null;
  onboarding_step: number | null;
  onboarding_completed: boolean | null;
  onboarding_skipped: boolean | null;
  account_client_id: number | string | null;
  first_post_id: number | string | null;
};

function rowToState(row: Row | null): OnboardingState {
  if (!row) return { ...DEFAULT_STATE };
  return {
    started: Boolean(row.onboarding_started),
    step: Number(row.onboarding_step ?? 0),
    completed: Boolean(row.onboarding_completed),
    skipped: Boolean(row.onboarding_skipped),
    accountClientId:
      row.account_client_id != null ? String(row.account_client_id) : null,
    firstPostId: row.first_post_id != null ? String(row.first_post_id) : null,
  };
}

// Reads the caller's onboarding row (service-role, explicitly scoped to their
// own auth id — safe). Returns defaults when there's no row yet.
export async function getOnboardingState(
  userId: string
): Promise<OnboardingState> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("user_onboarding")
    .select(
      "onboarding_started, onboarding_step, onboarding_completed, onboarding_skipped, account_client_id, first_post_id"
    )
    .eq("user_id", userId)
    .maybeSingle();
  return rowToState((data as Row) ?? null);
}

// Decides whether landing on /proofer should divert into the guided tour.
//
// Foolproof for BOTH new and existing users:
//   - completed or skipped  → never divert.
//   - mid-flow (started)    → never divert either. Redirecting them made the
//     browser's Back button a loop (board → redirect → tour → back → board →
//     …) with no way out. The board shows them a resume banner instead
//     (getOnboardingResume / OnboardingResumeBanner), so the way back in is
//     visible rather than forced.
//   - never started:
//       * if the poster already has posts (an existing user who predates
//         onboarding), silently mark them complete so they're never trapped.
//       * otherwise they're genuinely new → divert.
// Staff are never diverted (onboarding targets posters / new self-serve users).
export async function shouldRunOnboarding(): Promise<boolean> {
  const access = await getProoferAccess();
  if (!access || access.kind !== "poster") return false;

  const state = await getOnboardingState(access.userId);
  if (state.completed || state.skipped) return false;
  if (state.started) return false;

  // Never started. Is this actually a brand-new poster? The RLS-scoped session
  // client only returns this user's team posts, so one hit means "not new".
  const supabase = await createClient();
  const { data: anyPost } = await supabase
    .from("proofer_posts")
    .select("id")
    .limit(1)
    .maybeSingle();

  if (anyPost) {
    // Existing user — retire onboarding quietly so they land on the board.
    const admin = createAdminClient();
    await admin.from("user_onboarding").upsert(
      {
        user_id: access.userId,
        onboarding_completed: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );
    return false;
  }

  return true;
}

// The other half of the above: a poster who started the tour and neither
// finished nor skipped it gets a "pick up where you left off" banner on the
// board. Returns the step to resume at, or null when there's nothing to offer
// (staff, never started, already finished or skipped).
export async function getOnboardingResume(): Promise<{
  step: number;
  total: number;
} | null> {
  const access = await getProoferAccess();
  if (!access || access.kind !== "poster") return null;

  const state = await getOnboardingState(access.userId);
  if (!state.started || state.completed || state.skipped) return null;

  const step = Math.min(Math.max(state.step, 1), ONBOARDING_TOTAL_STEPS);
  return { step, total: ONBOARDING_TOTAL_STEPS };
}
