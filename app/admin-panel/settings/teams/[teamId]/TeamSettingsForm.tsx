"use client";

import { useActionState } from "react";
import {
  renameTeam,
  setTeamPlan,
  deleteTeam,
  type ActionState,
} from "@/lib/auth/team-actions";
import {
  labelStyle,
  inputStyle,
  secondaryButtonStyle,
  errorBoxStyle,
  successBoxStyle,
} from "../form-styles";

export function TeamSettingsForm({
  teamId,
  name,
  plan,
}: {
  teamId: string;
  name: string;
  plan: "free" | "pro";
}) {
  const [renameState, renameAction, renaming] = useActionState<ActionState | null, FormData>(
    renameTeam,
    null
  );
  const [planState, planAction, planPending] = useActionState<ActionState | null, FormData>(
    setTeamPlan,
    null
  );
  const [deleteState, deleteAction, deleting] = useActionState<ActionState | null, FormData>(
    deleteTeam,
    null
  );

  const nextPlan = plan === "pro" ? "free" : "pro";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Rename */}
      <form action={renameAction} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {renameState?.error && <div style={errorBoxStyle}>{renameState.error}</div>}
        {renameState?.success && renameState.message && (
          <div style={successBoxStyle}>{renameState.message}</div>
        )}
        <input type="hidden" name="teamId" value={teamId} />
        <label style={labelStyle}>Team name</label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            name="name"
            defaultValue={name}
            required
            style={{ ...inputStyle, maxWidth: 320 }}
          />
          <button type="submit" disabled={renaming} style={secondaryButtonStyle(renaming)}>
            {renaming ? "Saving…" : "Save name"}
          </button>
        </div>
      </form>

      {/* Plan */}
      <form action={planAction} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {planState?.error && <div style={errorBoxStyle}>{planState.error}</div>}
        {planState?.success && planState.message && (
          <div style={successBoxStyle}>{planState.message}</div>
        )}
        <input type="hidden" name="teamId" value={teamId} />
        <input type="hidden" name="plan" value={nextPlan} />
        <label style={labelStyle}>Plan</label>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, color: "#3f3f46" }}>
            Currently <strong>{plan === "pro" ? "Pro" : "Free"}</strong>
            {plan === "free" ? " — collaborators can't be invited until you upgrade." : ""}
          </span>
          <button type="submit" disabled={planPending} style={secondaryButtonStyle(planPending)}>
            {planPending
              ? "Updating…"
              : nextPlan === "pro"
              ? "Upgrade to Pro"
              : "Switch to Free"}
          </button>
        </div>
      </form>

      {/* Danger zone */}
      <details style={{ borderTop: "1px solid #f4f4f5", paddingTop: 12 }}>
        <summary style={{ fontSize: 13, color: "#b91c1c", cursor: "pointer", fontWeight: 600 }}>
          Delete this team
        </summary>
        <form
          action={deleteAction}
          onSubmit={(e) => {
            if (!confirm("Delete this team? This can't be undone.")) e.preventDefault();
          }}
          style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}
        >
          {deleteState?.error && <div style={errorBoxStyle}>{deleteState.error}</div>}
          <input type="hidden" name="teamId" value={teamId} />
          <p style={{ fontSize: 12, color: "#71717a", margin: 0, maxWidth: 520 }}>
            Remove all accounts and everyone but the owner first. Deleting a team
            only removes the workspace and its memberships — the accounts
            themselves and their content are never deleted.
          </p>
          <button
            type="submit"
            disabled={deleting}
            style={{
              ...secondaryButtonStyle(deleting),
              color: "#b91c1c",
              borderColor: "#fecaca",
              alignSelf: "flex-start",
            }}
          >
            {deleting ? "Deleting…" : "Delete team"}
          </button>
        </form>
      </details>
    </div>
  );
}
