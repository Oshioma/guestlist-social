"use client";

import { useActionState } from "react";
import { deleteTeam, type ActionState } from "@/lib/auth/team-actions";
import DeleteClientButton from "@/app/admin-panel/components/DeleteClientButton";
import { errorBoxStyle } from "@/app/admin-panel/settings/teams/form-styles";

// One place for every irreversible action on a team, so they're easy to find
// and hard to hit by accident:
//   - Delete an account permanently (staff only) — removes the account and all
//     its content everywhere, not just from this team.
//   - Delete this team — the workspace + memberships only; accounts survive.
export function TeamDangerZone({
  teamId,
  accounts,
  isStaff,
  backTo,
}: {
  teamId: string;
  accounts: { clientId: number; name: string }[];
  isStaff: boolean;
  backTo: string;
}) {
  const [deleteState, deleteAction, deleting] = useActionState<
    ActionState | null,
    FormData
  >(deleteTeam, null);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      {isStaff && (
        <div>
          <div style={subheadStyle}>Delete an account permanently</div>
          <p style={noteStyle}>
            Permanently deletes the account and all of its content — posts,
            connections and reviews — <strong>everywhere</strong>, including any
            other team it belongs to. This cannot be undone. Staff only.
          </p>
          {accounts.length === 0 ? (
            <p style={{ ...noteStyle, margin: 0 }}>No accounts in this team.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {accounts.map((a) => (
                <div key={a.clientId} style={rowStyle}>
                  <span
                    style={{ fontSize: 14, fontWeight: 600, flex: 1, minWidth: 140 }}
                  >
                    {a.name}
                  </span>
                  <DeleteClientButton
                    clientId={String(a.clientId)}
                    redirectTo={backTo}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div>
        <div style={subheadStyle}>Delete this team</div>
        <form
          action={deleteAction}
          onSubmit={(e) => {
            if (!confirm("Delete this team? This can't be undone.")) {
              e.preventDefault();
            }
          }}
          style={{ display: "flex", flexDirection: "column", gap: 8 }}
        >
          {deleteState?.error && <div style={errorBoxStyle}>{deleteState.error}</div>}
          <input type="hidden" name="teamId" value={teamId} />
          <p style={noteStyle}>
            Remove all accounts and everyone but the owner first. Deleting a team
            only removes the workspace and its memberships — the accounts
            themselves and their content are never deleted.
          </p>
          <button
            type="submit"
            disabled={deleting}
            style={{
              background: "transparent",
              color: "#b91c1c",
              border: "1px solid #fecaca",
              borderRadius: 10,
              padding: "8px 12px",
              fontSize: 13,
              fontWeight: 600,
              alignSelf: "flex-start",
              cursor: deleting ? "wait" : "pointer",
              opacity: deleting ? 0.6 : 1,
            }}
          >
            {deleting ? "Deleting…" : "Delete team"}
          </button>
        </form>
      </div>
    </div>
  );
}

const subheadStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: "#b91c1c",
  marginBottom: 6,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};

const noteStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#71717a",
  margin: "0 0 10px",
  maxWidth: 560,
  lineHeight: 1.5,
};

const rowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "9px 12px",
  border: "1px solid #f4d5d5",
  borderRadius: 10,
  background: "#fff",
  flexWrap: "wrap",
};
