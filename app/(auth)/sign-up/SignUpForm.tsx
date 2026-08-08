"use client";

import { useActionState } from "react";
import Link from "next/link";
import Script from "next/script";
import { signUpWithPassword, type ActionState } from "@/lib/auth/actions";

export function SignUpForm() {
  const [state, action, isPending] = useActionState<ActionState | null, FormData>(
    signUpWithPassword,
    null
  );

  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  if (state?.success) {
    return (
      <div className="auth-form">
        <p className="auth-alert auth-alert-success">
          {state.message ?? "Check your email to confirm your account."}
        </p>
        <div className="auth-link-row">
          <Link href="/sign-in">Back to sign in</Link>
        </div>
      </div>
    );
  }

  return (
    <form action={action} className="auth-form">
      {state?.error && (
        <p className="auth-alert auth-alert-error">{state.error}</p>
      )}

      <div className="auth-field">
        <label htmlFor="fullName">Your name</label>
        <input
          id="fullName"
          name="fullName"
          type="text"
          autoComplete="name"
          required
          className={state?.fieldErrors?.fullName ? "input-error" : ""}
        />
        {state?.fieldErrors?.fullName && (
          <span className="auth-field-error">{state.fieldErrors.fullName[0]}</span>
        )}
      </div>

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
          <span className="auth-field-error">{state.fieldErrors.email[0]}</span>
        )}
      </div>

      <div className="auth-field">
        <label htmlFor="password">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          className={state?.fieldErrors?.password ? "input-error" : ""}
        />
        {state?.fieldErrors?.password && (
          <span className="auth-field-error">{state.fieldErrors.password[0]}</span>
        )}
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
        {isPending ? "Creating account…" : "Create account"}
      </button>

      <div className="auth-link-row">
        <Link href="/sign-in">Already have an account? Sign in</Link>
      </div>
    </form>
  );
}
