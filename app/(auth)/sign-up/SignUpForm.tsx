"use client";

import { useActionState } from "react";
import Link from "next/link";
import Script from "next/script";
import { signUpWithPassword, type ActionState } from "@/lib/auth/actions";

interface Props {
  next: string | null;
}

export function SignUpForm({ next }: Props) {
  const [state, action, isPending] = useActionState<ActionState | null, FormData>(
    signUpWithPassword,
    null
  );

  const qs = next ? `?next=${encodeURIComponent(next)}` : "";
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  if (state?.success) {
    return (
      <div className="auth-alert auth-alert-success" role="status">
        {state.message}
      </div>
    );
  }

  return (
    <form action={action} className="auth-form">
      <input type="hidden" name="next" value={next ?? ""} />

      {state?.error && (
        <p className="auth-alert auth-alert-error">{state.error}</p>
      )}

      <div className="auth-field">
        <label htmlFor="fullName">Full name</label>
        <input
          id="fullName"
          name="fullName"
          type="text"
          autoComplete="name"
          required
          className={state?.fieldErrors?.fullName ? "input-error" : ""}
        />
        {state?.fieldErrors?.fullName && (
          <span className="auth-field-error">
            {state.fieldErrors.fullName[0]}
          </span>
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
          autoComplete="new-password"
          required
          className={state?.fieldErrors?.password ? "input-error" : ""}
        />
        {state?.fieldErrors?.password && (
          <span className="auth-field-error">
            {state.fieldErrors.password[0]}
          </span>
        )}
      </div>

      <div className="auth-field">
        <label htmlFor="confirmPassword">Confirm password</label>
        <input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
          className={state?.fieldErrors?.confirmPassword ? "input-error" : ""}
        />
        {state?.fieldErrors?.confirmPassword && (
          <span className="auth-field-error">
            {state.fieldErrors.confirmPassword[0]}
          </span>
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

      <p className="auth-footer">
        Already have an account? <Link href={`/sign-in${qs}`}>Sign in</Link>
      </p>
    </form>
  );
}
