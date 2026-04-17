"use client";

import { useActionState } from "react";
import Link from "next/link";
import Script from "next/script";
import { sendPasswordReset, type ActionState } from "@/lib/auth/actions";

interface Props {
  next: string | null;
}

export function ForgotPasswordForm({ next }: Props) {
  const [state, action, isPending] = useActionState<ActionState | null, FormData>(
    sendPasswordReset,
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
        {isPending ? "Sending…" : "Send reset link"}
      </button>

      <p className="auth-footer">
        <Link href={`/sign-in${qs}`}>Back to sign in</Link>
      </p>
    </form>
  );
}
