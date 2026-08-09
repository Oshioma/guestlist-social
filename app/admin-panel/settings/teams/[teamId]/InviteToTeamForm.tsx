"use client";

import { useActionState } from "react";
import { inviteToTeam, type ActionState } from "@/lib/auth/team-actions";
import type { Plan } from "@/lib/billing/plans";
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
  teamName,
  plan,
  accountNames,
}: {
  teamId: string;
  teamName: string;
  plan: Plan;
  accountNames: string[];
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

      <div style={contextBoxStyle}>
        <div style={{ fontSize: 13 }}>
          Adding to <strong>{teamName}</strong>
        </div>
        {accountNames.length === 0 ? (
          <div style={{ fontSize: 12, color: "#a86a12", marginTop: 6 }}>
            This team has no accounts yet — add one above first, or they&rsquo;ll
            have nothing to see.
          </div>
        ) : (
          <>
            <div style={{ fontSize: 12, color: "#71717a", margin: "6px 0 6px" }}>
              They&rsquo;ll have access to {accountNames.length} account
              {accountNames.length === 1 ? "" : "s"}:
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {accountNames.map((n) => (
                <span key={n} style={accountChipStyle}>
                  {n}
                </span>
              ))}
            </div>
          </>
        )}
      </div>

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

const contextBoxStyle: React.CSSProperties = {
  background: "#f7f8f9",
  border: "1px solid #e6e6e9",
  borderRadius: 10,
  padding: "12px 14px",
};

const accountChipStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  background: "#e7f5ef",
  color: "#1f6b5c",
  border: "1px solid #cfe9df",
  borderRadius: 999,
  padding: "3px 10px",
};
