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
  /** May invite admins/members ("Teams"). */
  collaborators: boolean;
  /** May invite client-portal viewers ("Clients"). */
  clients: boolean;
  /** White-label / custom build tier. */
  whiteLabel: boolean;
  /** Marketing bullets shown on the billing panel. */
  features: string[];
  /**
   * Name of the env var holding this plan's Stripe Price id. null for free
   * (no checkout). The value is resolved at call time so a missing price only
   * disables that one plan's button rather than breaking the whole module.
   */
  priceEnv: string | null;
};

export const PLANS: Record<Plan, PlanConfig> = {
  free: {
    id: "free",
    name: "Free",
    priceMonthly: 0,
    priceLabel: "Free",
    socialAccounts: 2,
    collaborators: false,
    clients: false,
    whiteLabel: false,
    features: ["2 social media accounts", "Email support"],
    priceEnv: null,
  },
  pro: {
    id: "pro",
    name: "Pro",
    priceMonthly: 5,
    priceLabel: "$5/mo",
    socialAccounts: 10,
    collaborators: true,
    clients: false,
    whiteLabel: false,
    features: ["10 social media accounts", "Teams", "Email support"],
    priceEnv: "STRIPE_PRICE_PRO",
  },
  agency: {
    id: "agency",
    name: "Agency",
    priceMonthly: 49.99,
    priceLabel: "$49.99/mo",
    socialAccounts: 100,
    collaborators: true,
    clients: true,
    whiteLabel: true,
    features: [
      "100 social media accounts",
      "Teams",
      "Clients",
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
