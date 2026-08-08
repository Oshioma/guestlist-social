// Cloudflare Turnstile verification.
//
// If TURNSTILE_SECRET_KEY is not set, verification is normally skipped so the
// app runs in local/dev without a Turnstile account — BUT it fails closed once
// public sign-up is enabled (ENABLE_PUBLIC_SIGNUP=true): a public form must
// never run unprotected, so a missing secret in that posture is an error, not a
// silent skip. Set the secret in production to enforce.
//
// Escape hatch: set CAPTCHA_PROVIDER=none to run WITHOUT Turnstile entirely (no
// keys, no Cloudflare account). In that mode the CAPTCHA layer is off and the
// app leans on the keyless defences that are always on — honeypot + timing
// (bot-guard.ts) and per-IP/per-email rate limiting (rate-limit.ts) — which
// pairs best with Supabase "Confirm email" so bot accounts can't act unverified.

import { publicSignupEnabled } from "@/lib/auth/public-signup";

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

// Which CAPTCHA provider gates the auth forms. "turnstile" (default) uses
// Cloudflare Turnstile; "none" turns the CAPTCHA layer off (no keys required).
// Anything unrecognised is treated as the safe default, "turnstile".
export function captchaDisabled(): boolean {
  return (process.env.CAPTCHA_PROVIDER ?? "turnstile").trim().toLowerCase() === "none";
}

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
  // Opt-out: CAPTCHA disabled entirely. No keys, no fail-closed — the keyless
  // layers (honeypot, timing, rate limiting) still run in the auth actions.
  if (captchaDisabled()) return;

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
