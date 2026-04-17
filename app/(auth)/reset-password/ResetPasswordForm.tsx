"use client";

import { useActionState } from "react";
import { updatePassword, type ActionState } from "@/lib/auth/actions";

export function ResetPasswordForm() {
  const [state, action, isPending] = useActionState<ActionState | null, FormData>(
    updatePassword,
    null
  );

  return (
    <form action={action} className="auth-form">
      {state?.error && (
        <p className="auth-alert auth-alert-error">{state.error}</p>
      )}

      <div className="auth-field">
        <label htmlFor="password">New password</label>
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
        <label htmlFor="confirmPassword">Confirm new password</label>
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
        {isPending ? "Updating…" : "Update password"}
      </button>
    </form>
  );
}
