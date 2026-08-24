import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getProoferAccess } from "@/lib/auth/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { authRedirectOrigin } from "@/lib/auth/request-origin";
import { getStripe, stripeConfigured } from "@/lib/stripe";
import {
  isPaidPlan,
  planConfig,
  stripePriceId,
  TRIAL_DAYS,
  type Plan,
} from "@/lib/billing/plans";

// POST /api/stripe/checkout  { teamId, plan }
//
// Starts a Stripe Checkout session for a team's subscription and returns the
// hosted-checkout URL. Billing is owner-only (agency staff may act on any
// team). Every paid plan begins with a TRIAL_DAYS free trial — "1 month trial,
// any plan" — configured via subscription_data.trial_period_days so the card is
// collected up front but not charged until the trial ends.
//
// The webhook (app/api/stripe/webhook) is what actually flips teams.plan once
// the subscription exists; this route only kicks off checkout.
export async function POST(req: Request) {
  if (!stripeConfigured()) {
    return NextResponse.json(
      { error: "Billing isn't configured on this deployment." },
      { status: 503 }
    );
  }

  const access = await getProoferAccess();
  if (!access) {
    return NextResponse.json({ error: "You're not signed in." }, { status: 401 });
  }

  let body: { teamId?: string; plan?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const teamId = typeof body.teamId === "string" ? body.teamId : "";
  const plan = body.plan as Plan;
  if (!teamId || !isPaidPlan(plan)) {
    return NextResponse.json({ error: "Missing team or plan." }, { status: 400 });
  }

  const priceId = stripePriceId(plan);
  if (!priceId) {
    return NextResponse.json(
      { error: `The ${planConfig(plan).name} plan isn't available for purchase yet.` },
      { status: 503 }
    );
  }

  const admin = createAdminClient();
  const { data: team } = await admin
    .from("teams")
    .select("id, name, owner_user_id, stripe_customer_id")
    .eq("id", teamId)
    .maybeSingle();
  if (!team) {
    return NextResponse.json({ error: "Team not found." }, { status: 404 });
  }

  const isStaff = access.kind === "staff";
  if (!isStaff && team.owner_user_id !== access.userId) {
    return NextResponse.json(
      { error: "Only the team owner can manage billing." },
      { status: 403 }
    );
  }

  const stripe = getStripe();

  // Any Stripe call below can throw (wrong-mode key, deleted price, network).
  // An unhandled throw would surface as a bare 500 and the billing panel could
  // only say "Something went wrong" — so catch and return the real reason.
  try {
    // Reuse the team's Stripe customer, or create one and remember it. Storing
    // it now (not just via the webhook) keeps repeat checkouts on one customer.
    // A stored id can be stale — deleted in the dashboard, or created under a
    // different key mode (test vs live) — in which case checkout would throw
    // "No such customer"; verify it and fall back to creating a fresh one.
    let customerId = team.stripe_customer_id as string | null;
    if (customerId) {
      try {
        const existing = await stripe.customers.retrieve(customerId);
        if (existing.deleted) customerId = null;
      } catch (e) {
        if ((e as Stripe.errors.StripeError)?.code === "resource_missing") {
          customerId = null;
        } else {
          throw e;
        }
      }
    }
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: access.email ?? undefined,
        name: (team.name as string) ?? undefined,
        metadata: { teamId },
      });
      customerId = customer.id;
      await admin.from("teams").update({ stripe_customer_id: customerId }).eq("id", teamId);
    }

    const origin = await authRedirectOrigin();
    // Billing lives on the Teams list page now (the per-team detail page is
    // retired), so send the customer back there after checkout.
    const returnTo = `${origin}/proofer/teams`;

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: {
        trial_period_days: TRIAL_DAYS,
        metadata: { teamId, plan },
      },
      client_reference_id: teamId,
      metadata: { teamId, plan },
      allow_promotion_codes: true,
      success_url: `${returnTo}?billing=success`,
      cancel_url: `${returnTo}?billing=cancelled`,
    });

    if (!session.url) {
      return NextResponse.json({ error: "Could not start checkout." }, { status: 502 });
    }
    return NextResponse.json({ url: session.url });
  } catch (e) {
    console.error("stripe checkout failed:", e);
    const detail = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json(
      { error: `Couldn't start checkout: ${detail}` },
      { status: 502 }
    );
  }
}
