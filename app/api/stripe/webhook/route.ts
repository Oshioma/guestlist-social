import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe, stripeConfigured } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { planForPriceId, type Plan } from "@/lib/billing/plans";

// POST /api/stripe/webhook
//
// Stripe's source of truth for subscription state. This is the ONLY place that
// grants or revokes a paid entitlement: it verifies the signature, then writes
// teams.plan (+ status, ids, period end, trial end) from the subscription.
//
// Runs on the Node runtime and reads the raw body so signature verification
// works — never parse the request before constructEvent.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Statuses that keep a paid entitlement live. past_due is included so a failed
// renewal doesn't instantly lock the team out while Stripe retries the card.
const ENTITLED = new Set(["trialing", "active", "past_due"]);

function toIso(seconds: number | null | undefined): string | null {
  if (!seconds && seconds !== 0) return null;
  return new Date(seconds * 1000).toISOString();
}

// current_period_end moved onto subscription items in recent Stripe API
// versions; read the top-level field when present and fall back to the item.
function periodEnd(sub: Stripe.Subscription): number | null {
  const loose = sub as unknown as { current_period_end?: number };
  if (typeof loose.current_period_end === "number") return loose.current_period_end;
  const item = sub.items?.data?.[0] as unknown as { current_period_end?: number } | undefined;
  return typeof item?.current_period_end === "number" ? item.current_period_end : null;
}

async function syncSubscription(sub: Stripe.Subscription): Promise<void> {
  const admin = createAdminClient();

  const teamId =
    (sub.metadata?.teamId as string | undefined) ||
    (typeof sub.customer === "string" ? await teamIdForCustomer(admin, sub.customer) : null);
  if (!teamId) {
    console.warn("[stripe/webhook] subscription has no resolvable team", sub.id);
    return;
  }

  const priceId = sub.items?.data?.[0]?.price?.id ?? null;
  const tier: Plan | null =
    planForPriceId(priceId) ?? ((sub.metadata?.plan as Plan | undefined) ?? null);

  const entitled = ENTITLED.has(sub.status);
  const plan: Plan = entitled && tier ? tier : "free";

  const { error } = await admin
    .from("teams")
    .update({
      plan,
      subscription_status: sub.status,
      stripe_subscription_id: sub.status === "canceled" ? null : sub.id,
      stripe_customer_id: typeof sub.customer === "string" ? sub.customer : undefined,
      current_period_end: toIso(periodEnd(sub)),
      trial_ends_at: toIso(sub.trial_end),
    })
    .eq("id", teamId);

  if (error) {
    console.error("[stripe/webhook] failed to sync team", teamId, error.message);
    throw error;
  }
}

async function teamIdForCustomer(
  admin: ReturnType<typeof createAdminClient>,
  customerId: string
): Promise<string | null> {
  const { data } = await admin
    .from("teams")
    .select("id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  return data ? String(data.id) : null;
}

export async function POST(req: Request) {
  if (!stripeConfigured()) {
    return NextResponse.json({ error: "Billing not configured." }, { status: 503 });
  }
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[stripe/webhook] STRIPE_WEBHOOK_SECRET is not set");
    return NextResponse.json({ error: "Webhook secret not configured." }, { status: 503 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature." }, { status: 400 });
  }

  const stripe = getStripe();
  const raw = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(raw, signature, secret);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[stripe/webhook] signature verification failed:", message);
    return NextResponse.json({ error: `Invalid signature: ${message}` }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.subscription) {
          const subId =
            typeof session.subscription === "string"
              ? session.subscription
              : session.subscription.id;
          const sub = await stripe.subscriptions.retrieve(subId);
          await syncSubscription(sub);
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        await syncSubscription(event.data.object as Stripe.Subscription);
        break;
      }
      default:
        // Ignore everything else — Stripe sends many event types.
        break;
    }
  } catch (err) {
    // Return 500 so Stripe retries; the handler is idempotent (upserts by id).
    const message = err instanceof Error ? err.message : String(err);
    console.error("[stripe/webhook] handler error:", message);
    return NextResponse.json({ error: "Handler error." }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
