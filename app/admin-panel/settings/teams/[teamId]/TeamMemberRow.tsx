"use client";

import { useActionState } from "react";
import {
  updateTeamMemberRole,
  removeTeamMember,
  type ActionState,
} from "@/lib/auth/team-actions";
import type { TeamMember } from "./types";
import type { Plan } from "@/lib/billing/plans";
import { inputStyle, secondaryButtonStyle, errorBoxStyle } from "../form-styles";

export function TeamMemberRow({
  teamId,
  member,
  plan,
}: {
  teamId: string;
  member: TeamMember;
  plan: Plan;
}) {
  const [roleState, roleAction, rolePending] = useActionState<ActionState | null, FormData>(
    updateTeamMemberRole,
    null
  );
  const [removeState, removeAction, removePending] = useActionState<ActionState | null, FormData>(
    removeTeamMember,
    null
  );

  const isFree = plan === "free";
  const error = roleState?.error || removeState?.error;

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

        {member.isOwner ? (
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              color: "#9d2b5b",
              padding: "4px 10px",
              borderRadius: 999,
              background: "#faf0f4",
              border: "1px solid #eccdd9",
            }}
          >
            Owner
          </span>
        ) : (
          <>
            <form action={roleAction} style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input type="hidden" name="teamId" value={teamId} />
              <input type="hidden" name="userId" value={member.userId} />
              <select
                name="role"
                defaultValue={member.role === "owner" ? "admin" : member.role}
                style={{ ...inputStyle, width: "auto", padding: "6px 8px" }}
              >
                <option value="client">Client</option>
                <option value="member" disabled={isFree}>
                  Creator{isFree ? " · Pro" : ""}
                </option>
                <option value="proofer" disabled={isFree}>
                  Proofer{isFree ? " · Pro" : ""}
                </option>
                <option value="admin" disabled={isFree}>
                  Admin{isFree ? " · Pro" : ""}
                </option>
              </select>
              <button type="submit" disabled={rolePending} style={secondaryButtonStyle(rolePending)}>
                {rolePending ? "…" : "Save"}
              </button>
            </form>

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
          </>
        )}
      </div>

      {error && <div style={errorBoxStyle}>{error}</div>}
    </div>
  );
}
