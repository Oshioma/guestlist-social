"use client";

import { useActionState } from "react";
import { inviteToTeam, type ActionState } from "@/lib/auth/team-actions";
import {
  formStyle,
  labelStyle,
  inputStyle,
  primaryButtonStyle,
  errorBoxStyle,
  successBoxStyle,
  fieldErrorStyle,
} from "../form-styles";

export function InviteToTeamForm({
  teamId,
  plan,
}: {
  teamId: string;
  plan: "free" | "pro";
}) {
  const [state, action, isPending] = useActionState<ActionState | null, FormData>(
    inviteToTeam,
    null
  );

  const isFree = plan === "free";

  return (
    <form action={action} style={formStyle}>
      {state?.error && <div style={errorBoxStyle}>{state.error}</div>}
      {state?.success && state.message && (
        <div style={successBoxStyle}>{state.message}</div>
      )}

      <input type="hidden" name="teamId" value={teamId} />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 170px", gap: 8 }}>
        <div>
          <label style={labelStyle}>Email</label>
          <input
            name="email"
            type="email"
            required
            placeholder="client@example.com"
            style={inputStyle}
          />
          {state?.fieldErrors?.email && (
            <span style={fieldErrorStyle}>{state.fieldErrors.email[0]}</span>
          )}
        </div>
        <div>
          <label style={labelStyle}>Role</label>
          <select name="role" defaultValue="client" style={inputStyle}>
            <option value="client">Client (view &amp; approve)</option>
            <option value="member" disabled={isFree}>
              Member{isFree ? " · Pro" : ""}
            </option>
            <option value="admin" disabled={isFree}>
              Admin{isFree ? " · Pro" : ""}
            </option>
          </select>
        </div>
      </div>

      <p style={{ fontSize: 12, color: "#71717a", margin: 0 }}>
        A client sees and approves only this team&rsquo;s content. Members and
        admins can work the board — draft, caption, schedule and proof — but
        never see stored passwords or tokens.{" "}
        {isFree
          ? "Inviting members or admins needs a Pro team; upgrade in Team settings."
          : "Only agency staff push posts live to Meta."}
      </p>

      <button type="submit" disabled={isPending} style={primaryButtonStyle(isPending)}>
        {isPending ? "Sending…" : "Send invite"}
      </button>
    </form>
  );
}
