"use client";

import { useActionState } from "react";
import { setTeamAccount, type ActionState } from "@/lib/auth/team-actions";
import type { AccountOption } from "./page";
import { secondaryButtonStyle, errorBoxStyle } from "../form-styles";

export function TeamAccountsManager({
  teamId,
  accounts,
}: {
  teamId: string;
  accounts: AccountOption[];
}) {
  const inTeam = accounts.filter((a) => a.inTeam);
  const available = accounts.filter((a) => !a.inTeam);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <div style={subheadStyle}>In this team ({inTeam.length})</div>
        {inTeam.length === 0 ? (
          <p style={emptyStyle}>No accounts yet. Add one below.</p>
        ) : (
          <div style={listStyle}>
            {inTeam.map((a) => (
              <AccountRow key={a.clientId} teamId={teamId} account={a} action="remove" />
            ))}
          </div>
        )}
      </div>

      {available.length > 0 && (
        <div>
          <div style={subheadStyle}>Available to add ({available.length})</div>
          <div style={listStyle}>
            {available.map((a) => (
              <AccountRow key={a.clientId} teamId={teamId} account={a} action="add" />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function AccountRow({
  teamId,
  account,
  action,
}: {
  teamId: string;
  account: AccountOption;
  action: "add" | "remove";
}) {
  const [state, formAction, isPending] = useActionState<ActionState | null, FormData>(
    setTeamAccount,
    null
  );

  const isRemove = action === "remove";

  return (
    <div style={rowStyle}>
      <span style={{ fontSize: 14, flex: 1, minWidth: 140 }}>{account.name}</span>
      {state?.error && <div style={errorBoxStyle}>{state.error}</div>}
      <form action={formAction}>
        <input type="hidden" name="teamId" value={teamId} />
        <input type="hidden" name="clientId" value={account.clientId} />
        <input type="hidden" name="action" value={action} />
        <button
          type="submit"
          disabled={isPending}
          style={{
            ...secondaryButtonStyle(isPending),
            ...(isRemove ? { color: "#b91c1c", borderColor: "#fecaca" } : {}),
          }}
        >
          {isPending ? "…" : isRemove ? "Remove" : "Add"}
        </button>
      </form>
    </div>
  );
}

const subheadStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: "#71717a",
  marginBottom: 8,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};

const listStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

const rowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "9px 12px",
  border: "1px solid #e4e4e7",
  borderRadius: 10,
  background: "#fff",
  flexWrap: "wrap",
};

const emptyStyle: React.CSSProperties = {
  fontSize: 13,
  color: "#a1a1aa",
  margin: 0,
};
