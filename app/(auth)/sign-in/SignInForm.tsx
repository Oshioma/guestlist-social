"use client";

import { useActionState } from "react";
import Link from "next/link";
import Script from "next/script";
import { signInWithPassword, type ActionState } from "@/lib/auth/actions";

interface Props {
  next: string | null;
}

export function SignInForm({ next }: Props) {
  const [state, action, isPending] = useActionState<ActionState | null, FormData>(
    signInWithPassword,
    null
  );

  const qs = next ? `?next=${encodeURIComponent(next)}` : "";
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  return (
    <form action={action} className="auth-form">
      <input type="hidden" name="next" value={next ?? ""} />

      {state?.error && (
        <p className="auth-alert auth-alert-error">{state.error}</p>
      )}

      <div className="auth-field">
        <label htmlFor="email">Email</label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className={state?.fieldErrors?.email ? "input-error" : ""}
        />
        {state?.fieldErrors?.email && (
          <span className="auth-field-error">
            {state.fieldErrors.email[0]}
          </span>
        )}
      </div>

      <div className="auth-field">
        <label htmlFor="password">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className={state?.fieldErrors?.password ? "input-error" : ""}
        />
        {state?.fieldErrors?.password && (
          <span className="auth-field-error">
            {state.fieldErrors.password[0]}
          </span>
        )}
      </div>

      <div className="auth-link-row">
        <Link href={`/forgot-password${qs}`}>Forgot password?</Link>
      </div>

      {siteKey && (
        <>
          <div className="cf-turnstile" data-sitekey={siteKey} />
          <Script
            src="https://challenges.cloudflare.com/turnstile/v0/api.js"
            strategy="lazyOnload"
          />
        </>
      )}

      <button type="submit" disabled={isPending} className="auth-submit">
        {isPending ? "Signing in…" : "Sign in"}
      </button>

      <p className="auth-footer">
        No account? <Link href={`/sign-up${qs}`}>Create one</Link>
      </p>
    </form>
  );
}
