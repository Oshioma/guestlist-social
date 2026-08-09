"use client";

import { useActionState } from "react";
import { createTeam, type ActionState } from "@/lib/auth/team-actions";
import {
  formStyle,
  labelStyle,
  inputStyle,
  primaryButtonStyle,
  errorBoxStyle,
  successBoxStyle,
  fieldErrorStyle,
} from "./form-styles";

export function CreateTeamForm() {
  const [state, action, isPending] = useActionState<ActionState | null, FormData>(
    createTeam,
    null
  );

  return (
    <form action={action} style={formStyle}>
      {state?.error && <div style={errorBoxStyle}>{state.error}</div>}
      {state?.success && state.message && (
        <div style={successBoxStyle}>{state.message}</div>
      )}

      <div>
        <label style={labelStyle}>Team name</label>
        <input name="name" required placeholder="e.g. Alsop & Walker" style={inputStyle} />
        {state?.fieldErrors?.name && (
          <span style={fieldErrorStyle}>{state.fieldErrors.name[0]}</span>
        )}
      </div>

      <button type="submit" disabled={isPending} style={primaryButtonStyle(isPending)}>
        {isPending ? "Creating…" : "Create team"}
      </button>
      <p style={{ fontSize: 12, color: "#a1a1aa", margin: 0 }}>
        New teams start on the Free plan. Upgrade to Pro or Agency from the
        team&rsquo;s settings once it&rsquo;s created.
      </p>
    </form>
  );
}
