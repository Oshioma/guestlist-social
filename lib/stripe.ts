import "server-only";
import Stripe from "stripe";

// One canonical Stripe client. Reads STRIPE_SECRET_KEY lazily so importing this
// module never throws at build time — only actually using Stripe (checkout,
// portal, webhook) requires the key to be set. The API version is pinned by the
// installed SDK; we deliberately don't override it here so the types stay in
// sync with the library.
let cached: Stripe | null = null;

export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      "STRIPE_SECRET_KEY is not set — billing is not configured on this deployment."
    );
  }
  if (!cached) cached = new Stripe(key);
  return cached;
}

/** True when the secret key is present, so callers can degrade gracefully. */
export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}
