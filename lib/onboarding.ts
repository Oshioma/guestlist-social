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
//   - mid-flow (started)    → divert to resume.
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
  if (state.started) return true;

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
