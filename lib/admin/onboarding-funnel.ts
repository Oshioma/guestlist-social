import "server-only";

// ---------------------------------------------------------------------------
// Super-admin: the first-run onboarding funnel. Aggregates onboarding_events
// into distinct-user counts per milestone, in order, so the owner can see
// where people drop off. Service-role + super-admin gated.
// ---------------------------------------------------------------------------

import { createAdminClient } from "@/lib/supabase/admin";
import { isSuperAdmin } from "@/lib/auth/permissions";

export type FunnelStep = {
  key: string;
  label: string;
  users: number;
  // % of the previous step's users who reached this one (null for the first).
  keptPct: number | null;
};

export type OnboardingFunnel = {
  steps: FunnelStep[];
  started: number;
  completed: number;
  skipped: number;
};

const ORDER: [string, string][] = [
  ["onboarding_started", "Started"],
  ["account_created", "Account set up"],
  ["social_connected", "Connected a social account"],
  ["first_post_generated", "Generated a draft"],
  ["hook_used", "Used Hook"],
  ["more_fun_used", "Used More Fun"],
  ["shorter_used", "Used Shorter"],
  ["stock_image_selected", "Added an image"],
  ["schedule_time_selected", "Chose a time"],
  ["first_post_saved", "Saved the post"],
  ["green_explained", "Learned green"],
  ["onboarding_completed", "Finished"],
];

export async function loadOnboardingFunnel(): Promise<OnboardingFunnel> {
  const empty: OnboardingFunnel = { steps: [], started: 0, completed: 0, skipped: 0 };
  if (!(await isSuperAdmin())) return empty;

  const admin = createAdminClient();
  const { data } = await admin.from("onboarding_events").select("user_id, event");

  const usersByEvent = new Map<string, Set<string>>();
  for (const r of (data ?? []) as { user_id: string | null; event: string }[]) {
    if (!r.user_id) continue;
    const set = usersByEvent.get(r.event) ?? new Set<string>();
    set.add(String(r.user_id));
    usersByEvent.set(r.event, set);
  }

  const count = (key: string) => usersByEvent.get(key)?.size ?? 0;

  let prev: number | null = null;
  const steps: FunnelStep[] = ORDER.map(([key, label]) => {
    const users = count(key);
    const keptPct = prev && prev > 0 ? Math.round((users / prev) * 100) : null;
    prev = users;
    return { key, label, users, keptPct };
  });

  return {
    steps,
    started: count("onboarding_started"),
    completed: count("onboarding_completed"),
    skipped: count("onboarding_skipped"),
  };
}
