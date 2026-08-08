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

      <div style={{ display: "grid", gridTemplateColumns: "1fr 140px", gap: 8 }}>
        <div>
          <label style={labelStyle}>Team name</label>
          <input name="name" required placeholder="e.g. Alsop & Walker" style={inputStyle} />
          {state?.fieldErrors?.name && (
            <span style={fieldErrorStyle}>{state.fieldErrors.name[0]}</span>
          )}
        </div>
        <div>
          <label style={labelStyle}>Plan</label>
          <select name="plan" defaultValue="free" style={inputStyle}>
            <option value="free">Free</option>
            <option value="pro">Pro</option>
          </select>
        </div>
      </div>

      <button type="submit" disabled={isPending} style={primaryButtonStyle(isPending)}>
        {isPending ? "Creating…" : "Create team"}
      </button>
    </form>
  );
}
