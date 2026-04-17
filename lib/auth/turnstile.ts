// Cloudflare Turnstile verification — optional.
// If TURNSTILE_SECRET_KEY is not set, verification is skipped silently so the
// app works in local/dev without a Turnstile account. Set the secret in
// production to enforce.

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export async function verifyTurnstile(
  token: string | null | undefined
): Promise<void> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return;

  if (!token) {
    throw new Error("Human verification is required. Please complete the challenge.");
  }

  const res = await fetch(VERIFY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ secret, response: token }),
  });

  if (!res.ok) {
    throw new Error("Human verification check failed. Please try again.");
  }

  const data = (await res.json()) as {
    success: boolean;
    "error-codes"?: string[];
  };

  if (!data.success) {
    throw new Error("Human verification failed. Please try again.");
  }
}

export function turnstileSiteKey(): string | null {
  return process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || null;
}
