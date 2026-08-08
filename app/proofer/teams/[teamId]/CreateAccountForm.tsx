"use client";

import { useActionState } from "react";
import { createTeamAccount, type ActionState } from "@/lib/auth/team-actions";
import {
  formStyle,
  labelStyle,
  inputStyle,
  primaryButtonStyle,
  errorBoxStyle,
  successBoxStyle,
  fieldErrorStyle,
} from "@/app/admin-panel/settings/teams/form-styles";

export function CreateAccountForm({ teamId }: { teamId: string }) {
  const [state, action, isPending] = useActionState<ActionState | null, FormData>(
    createTeamAccount,
    null
  );

  return (
    <form action={action} style={formStyle}>
      {state?.error && <div style={errorBoxStyle}>{state.error}</div>}
      {state?.success && state.message && (
        <div style={successBoxStyle}>{state.message}</div>
      )}

      <input type="hidden" name="teamId" value={teamId} />

      <div>
        <label style={labelStyle}>New account name</label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            name="name"
            required
            placeholder="e.g. My Café"
            style={{ ...inputStyle, maxWidth: 320 }}
          />
          <button type="submit" disabled={isPending} style={primaryButtonStyle(isPending)}>
            {isPending ? "Creating…" : "Create account"}
          </button>
        </div>
        {state?.fieldErrors?.name && (
          <span style={fieldErrorStyle}>{state.fieldErrors.name[0]}</span>
        )}
      </div>
    </form>
  );
}
