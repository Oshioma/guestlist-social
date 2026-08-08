// Cloudflare Turnstile verification.
//
// If TURNSTILE_SECRET_KEY is not set, verification is normally skipped so the
// app runs in local/dev without a Turnstile account — BUT it fails closed once
// public sign-up is enabled (ENABLE_PUBLIC_SIGNUP=true): a public form must
// never run unprotected, so a missing secret in that posture is an error, not a
// silent skip. Set the secret in production to enforce.

import { publicSignupEnabled } from "@/lib/auth/public-signup";

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

type VerifyOptions = {
  // The end-user's IP, forwarded to Cloudflare for an extra correctness signal
  // (and so their risk model sees the real client, not our server).
  remoteip?: string | null;
};

type SiteverifyResponse = {
  success: boolean;
  hostname?: string;
  "error-codes"?: string[];
};

// Optional allowlist of hostnames a solved challenge may come from, e.g.
// "postproofer.com,www.postproofer.com". When set, a token solved on any other
// hostname is rejected — this defeats tokens farmed on an attacker's own page.
function allowedHostnames(): string[] {
  return (process.env.TURNSTILE_ALLOWED_HOSTNAMES ?? "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
}

export async function verifyTurnstile(
  token: string | null | undefined,
  options: VerifyOptions = {}
): Promise<void> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    // Fail closed in a public posture; skip silently only while invite-only.
    if (publicSignupEnabled()) {
      throw new Error(
        "Human verification isn't configured. Please try again later."
      );
    }
    return;
  }

  if (!token) {
    throw new Error(
      "Human verification is required. Please complete the challenge."
    );
  }

  const body = new URLSearchParams({ secret, response: token });
  if (options.remoteip) body.set("remoteip", options.remoteip);

  const res = await fetch(VERIFY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    throw new Error("Human verification check failed. Please try again.");
  }

  const data = (await res.json()) as SiteverifyResponse;

  if (!data.success) {
    throw new Error("Human verification failed. Please try again.");
  }

  const allowed = allowedHostnames();
  if (allowed.length > 0) {
    const hostname = (data.hostname ?? "").toLowerCase();
    if (!allowed.includes(hostname)) {
      throw new Error("Human verification failed. Please try again.");
    }
  }
}

export function turnstileSiteKey(): string | null {
  return process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || null;
}
