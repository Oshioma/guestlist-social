"use client";

import { useActionState } from "react";
import { removeTeamMember, type ActionState } from "@/lib/auth/team-actions";
import type { TeamMember } from "./page";
import { secondaryButtonStyle, errorBoxStyle } from "../form-styles";

const ROLE_LABEL: Record<TeamMember["role"], string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
  client: "Client",
};

export function TeamMemberRow({
  teamId,
  member,
}: {
  teamId: string;
  member: TeamMember;
}) {
  const [removeState, removeAction, removePending] = useActionState<ActionState | null, FormData>(
    removeTeamMember,
    null
  );

  const isPro = member.role === "owner";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        padding: "10px 12px",
        border: "1px solid #e4e4e7",
        borderRadius: 10,
        background: "#fff",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 160 }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>
            {member.fullName || member.email}
          </div>
          {member.fullName && (
            <div style={{ fontSize: 12, color: "#a1a1aa" }}>{member.email}</div>
          )}
        </div>

        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.04em",
            color: isPro ? "#9d2b5b" : "#52525b",
            padding: "4px 10px",
            borderRadius: 999,
            background: isPro ? "#faf0f4" : "#f4f4f5",
            border: `1px solid ${isPro ? "#eccdd9" : "#e4e4e7"}`,
          }}
        >
          {ROLE_LABEL[member.role]}
        </span>

        {!member.isOwner && (
          <form
            action={removeAction}
            onSubmit={(e) => {
              if (!confirm(`Remove ${member.email} from this team?`)) e.preventDefault();
            }}
          >
            <input type="hidden" name="teamId" value={teamId} />
            <input type="hidden" name="userId" value={member.userId} />
            <button
              type="submit"
              disabled={removePending}
              style={{
                ...secondaryButtonStyle(removePending),
                color: "#b91c1c",
                borderColor: "#fecaca",
              }}
            >
              {removePending ? "…" : "Remove"}
            </button>
          </form>
        )}
      </div>

      {removeState?.error && <div style={errorBoxStyle}>{removeState.error}</div>}
    </div>
  );
}
