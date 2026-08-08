"use client";

import { useActionState } from "react";
import { inviteToOwnTeam, type ActionState } from "@/lib/auth/team-actions";
import {
  formStyle,
  labelStyle,
  inputStyle,
  primaryButtonStyle,
  errorBoxStyle,
  successBoxStyle,
  fieldErrorStyle,
} from "@/app/admin-panel/settings/teams/form-styles";

export function InviteOwnerForm() {
  const [state, action, isPending] = useActionState<ActionState | null, FormData>(
    inviteToOwnTeam,
    null
  );

  return (
    <form action={action} style={formStyle}>
      {state?.error && <div style={errorBoxStyle}>{state.error}</div>}
      {state?.success && state.message && (
        <div style={successBoxStyle}>{state.message}</div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <div>
          <label style={labelStyle}>Email</label>
          <input
            name="email"
            type="email"
            required
            placeholder="person@example.com"
            style={inputStyle}
          />
          {state?.fieldErrors?.email && (
            <span style={fieldErrorStyle}>{state.fieldErrors.email[0]}</span>
          )}
        </div>
        <div>
          <label style={labelStyle}>Their team name (optional)</label>
          <input name="teamName" placeholder="e.g. Their Brand" style={inputStyle} />
        </div>
      </div>

      <p style={{ fontSize: 12, color: "#71717a", margin: 0 }}>
        They get their own workspace as owner — not added to any of your teams.
        After signing in they can add and connect their own accounts. Leave the
        name blank to use &ldquo;their-email&rsquo;s Team&rdquo;.
      </p>

      <button type="submit" disabled={isPending} style={primaryButtonStyle(isPending)}>
        {isPending ? "Sending…" : "Send invite"}
      </button>
    </form>
  );
}
