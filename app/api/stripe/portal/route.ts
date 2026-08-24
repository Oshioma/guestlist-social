import { NextResponse } from "next/server";
import { getProoferAccess } from "@/lib/auth/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { authRedirectOrigin } from "@/lib/auth/request-origin";
import { getStripe, stripeConfigured } from "@/lib/stripe";

// Reaches an external service (Stripe API); the platform default is not a
// safe assumption for it.
export const maxDuration = 30;


// POST /api/stripe/portal  { teamId }
//
// Opens the Stripe Billing Portal for a team so the owner can change plan,
// update the card, or cancel. Owner-only (staff may act on any team). The
// team must already have a Stripe customer (i.e. have gone through checkout).
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

  let body: { teamId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const teamId = typeof body.teamId === "string" ? body.teamId : "";
  if (!teamId) {
    return NextResponse.json({ error: "Missing team." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: team } = await admin
    .from("teams")
    .select("owner_user_id, stripe_customer_id")
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

  const customerId = team.stripe_customer_id as string | null;
  if (!customerId) {
    return NextResponse.json(
      { error: "This team has no billing set up yet." },
      { status: 400 }
    );
  }

  const origin = await authRedirectOrigin();
  const stripe = getStripe();
  // Surface the real Stripe failure (stale customer id after a test/live key
  // switch, portal not configured in the dashboard, …) instead of letting the
  // throw become a bare 500 the panel can only render as "Something went wrong".
  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${origin}/proofer/teams`,
    });
    return NextResponse.json({ url: session.url });
  } catch (e) {
    console.error("stripe portal failed:", e);
    const detail = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json(
      { error: `Couldn't open the billing portal: ${detail}` },
      { status: 502 }
    );
  }
}
