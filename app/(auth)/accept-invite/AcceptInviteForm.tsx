"use client";

import { useActionState } from "react";
import { acceptInvite, type ActionState } from "./actions";

interface Props {
  email: string;
}

export function AcceptInviteForm({ email }: Props) {
  const [state, action, isPending] = useActionState<ActionState | null, FormData>(
    acceptInvite,
    null
  );

  return (
    <form action={action} className="auth-form">
      {state?.error && (
        <p className="auth-alert auth-alert-error">{state.error}</p>
      )}

      <div className="auth-field">
        <label htmlFor="email-display">Email</label>
        <input id="email-display" type="email" value={email} disabled />
      </div>

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
        <label htmlFor="password">Choose a password</label>
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

      <button type="submit" disabled={isPending} className="auth-submit">
        {isPending ? "Saving…" : "Finish setup"}
      </button>
    </form>
  );
}
