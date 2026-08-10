"use client";

import { useActionState } from "react";
import {
  renameTeam,
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

// Team name + danger-zone delete. Plan / billing lives in its own BillingPanel
// (checkout + Stripe portal) — a team's plan is no longer a free toggle.
export function TeamSettingsForm({
  teamId,
  name,
  showDelete = true,
}: {
  teamId: string;
  name: string;
  // When false, the delete control is omitted here — the caller shows it
  // elsewhere (e.g. a consolidated "Danger zone" section) so team deletion
  // isn't offered in two places.
  showDelete?: boolean;
}) {
  const [renameState, renameAction, renaming] = useActionState<ActionState | null, FormData>(
    renameTeam,
    null
  );
  const [deleteState, deleteAction, deleting] = useActionState<ActionState | null, FormData>(
    deleteTeam,
    null
  );

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

      {/* Danger zone (omitted when the caller renders delete elsewhere) */}
      {showDelete && (
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
      )}
    </div>
  );
}
