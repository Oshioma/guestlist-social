// Central plan catalogue — the single place that knows what each tier costs,
// what it unlocks, and which Stripe price backs it. Everything else (checkout,
// webhook, limit enforcement, the billing UI) reads from here so the numbers
// can never drift between the marketing copy and the code that enforces them.
//
// Pure data + pure functions only (no server-only imports) so both client
// components and server code can import it.

export type Plan = "free" | "pro" | "agency";

export type PlanConfig = {
  id: Plan;
  name: string;
  /** Monthly price in the smallest sensible display form; null for free. */
  priceMonthly: number | null;
  /** Human price label, e.g. "$5/mo". */
  priceLabel: string;
  /** Max connected social accounts (each Instagram/Facebook profile counts as one). */
  socialAccounts: number;
  /**
   * Max teams a user may OWN on this plan (null = unlimited). Free includes one
   * team — your personal workspace; creating more needs a paid plan. Being
   * invited to someone else's team never counts against this.
   */
  maxOwnedTeams: number | null;
  /** May invite admins/members ("Teams"). */
  collaborators: boolean;
  /** May invite client-portal viewers ("Clients"). */
  clients: boolean;
  /** White-label / custom build tier. */
  whiteLabel: boolean;
  /**
   * Max size (in bytes) of a single video upload on this plan. Agency gets a
   * larger ceiling; everyone else shares the default. Enforced in the upload UI
   * (see maxVideoUploadBytes()).
   */
  maxVideoUploadBytes: number;
  /** Marketing bullets shown on the billing panel. */
  features: string[];
  /**
   * Name of the env var holding this plan's Stripe Price id. null for free
   * (no checkout). The value is resolved at call time so a missing price only
   * disables that one plan's button rather than breaking the whole module.
   */
  priceEnv: string | null;
};

/** Video upload ceiling for non-agency plans. */
export const MAX_VIDEO_BYTES_DEFAULT = 200 * 1024 * 1024; // 200 MB
/** Video upload ceiling on the Agency plan. */
export const MAX_VIDEO_BYTES_AGENCY = 500 * 1024 * 1024; // 500 MB

export const PLANS: Record<Plan, PlanConfig> = {
  free: {
    id: "free",
    name: "Free",
    priceMonthly: 0,
    priceLabel: "Free",
    socialAccounts: 2,
    maxOwnedTeams: 1,
    collaborators: false,
    clients: false,
    whiteLabel: false,
    maxVideoUploadBytes: MAX_VIDEO_BYTES_DEFAULT,
    features: ["Your own workspace", "2 social media accounts", "Email support"],
    priceEnv: null,
  },
  pro: {
    id: "pro",
    name: "Pro",
    priceMonthly: 5,
    priceLabel: "$5/mo",
    socialAccounts: 10,
    maxOwnedTeams: null,
    collaborators: true,
    clients: false,
    whiteLabel: false,
    maxVideoUploadBytes: MAX_VIDEO_BYTES_DEFAULT,
    features: ["Teams for clients & projects", "10 social media accounts", "Invite your team", "Email support"],
    priceEnv: "STRIPE_PRICE_PRO",
  },
  agency: {
    id: "agency",
    name: "Agency",
    priceMonthly: 49.99,
    priceLabel: "$49.99/mo",
    socialAccounts: 100,
    maxOwnedTeams: null,
    collaborators: true,
    clients: true,
    whiteLabel: true,
    maxVideoUploadBytes: MAX_VIDEO_BYTES_AGENCY,
    features: [
      "Teams for clients & projects",
      "100 social media accounts",
      "Invite your team",
      "Client access",
      "Custom build",
      "White label",
      "Email, WhatsApp, telephone support",
    ],
    priceEnv: "STRIPE_PRICE_AGENCY",
  },
};

/** Every paid plan can start with a free trial of this length. */
export const TRIAL_DAYS = 30;

export const PLAN_ORDER: Plan[] = ["free", "pro", "agency"];

/** Paid plans, in upgrade order — what the checkout UI offers. */
export const PAID_PLANS: Plan[] = ["pro", "agency"];

export function planConfig(plan: string | null | undefined): PlanConfig {
  if (plan === "pro" || plan === "agency") return PLANS[plan];
  return PLANS.free;
}

export function isPaidPlan(plan: string | null | undefined): plan is "pro" | "agency" {
  return plan === "pro" || plan === "agency";
}

/** Max teams a user may own on this plan; null = unlimited. */
export function maxOwnedTeams(plan: string | null | undefined): number | null {
  return planConfig(plan).maxOwnedTeams;
}

/** Max size (bytes) of a single video upload on this plan. */
export function maxVideoUploadBytes(plan: string | null | undefined): number {
  return planConfig(plan).maxVideoUploadBytes;
}

/** The Stripe Price id backing a plan, or null if unconfigured / free. */
export function stripePriceId(plan: Plan): string | null {
  const cfg = PLANS[plan];
  if (!cfg.priceEnv) return null;
  return process.env[cfg.priceEnv] ?? null;
}

/**
 * Reverse lookup: which plan does a Stripe Price id correspond to? Used by the
 * webhook to translate a subscription's price back into an entitlement tier.
 */
export function planForPriceId(priceId: string | null | undefined): Plan | null {
  if (!priceId) return null;
  for (const plan of PAID_PLANS) {
    if (stripePriceId(plan) === priceId) return plan;
  }
  return null;
}
