"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  updateTeamMemberRole,
  removeTeamMember,
  inviteToTeam,
} from "@/lib/auth/team-actions";

type Member = { userId: string; name: string; role: string; isOwner: boolean };

// Assignable roles, with a colour dot in the dropdown: green = can approve
// posts (Admin/Proofer), yellow = drafts only (Creator = the stored 'member').
const ROLE_OPTS = [
  { value: "admin", label: "🟢 Admin" },
  { value: "proofer", label: "🟢 Proofer" },
  { value: "member", label: "🟡 Creator" },
];

function roleLabel(role: string): string {
  switch (role) {
    case "owner": return "🟢 Owner";
    case "admin": return "🟢 Admin";
    case "proofer": return "🟢 Proofer";
    case "member": return "🟡 Creator";
    case "client": return "Client";
    default: return role;
  }
}

const AV = ["#4f46e5", "#0ea5e9", "#e11d48", "#16a34a", "#d97706", "#7c3aed"];
const avColor = (s: string) =>
  AV[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % AV.length];
const initials = (s: string) =>
  s.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase() || "?";

export function TeamMembersInline({
  teamId,
  members,
  canManage,
}: {
  teamId: string;
  members: Member[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function changeRole(userId: string, role: string) {
    setErr(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("teamId", teamId);
      fd.set("userId", userId);
      fd.set("role", role);
      const res = await updateTeamMemberRole(null, fd);
      if (res?.error) setErr(res.error);
      else router.refresh();
    });
  }

  function remove(userId: string, name: string) {
    if (!window.confirm(`Remove ${name} from this team?`)) return;
    setErr(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("teamId", teamId);
      fd.set("userId", userId);
      const res = await removeTeamMember(null, fd);
      if (res?.error) setErr(res.error);
      else router.refresh();
    });
  }

  function invite(formData: FormData) {
    setErr(null);
    formData.set("teamId", teamId);
    startTransition(async () => {
      const res = await inviteToTeam(null, formData);
      if (res?.error) setErr(res.error);
      else if (res?.fieldErrors) setErr("Enter a valid email address.");
      else {
        setAdding(false);
        router.refresh();
      }
    });
  }

  return (
    <div>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {members.map((m) => {
          const isOwner = m.isOwner || m.role === "owner";
          return (
            <div key={m.userId} style={rowStyle}>
              <span style={{ ...avatar, background: avColor(m.name) }}>{initials(m.name)}</span>
              <span style={nameStyle}>{m.name}</span>
              {isOwner ? (
                <span style={ownerTag}>🟢 Owner</span>
              ) : canManage ? (
                <select
                  value={m.role}
                  disabled={pending}
                  onChange={(e) => changeRole(m.userId, e.target.value)}
                  style={selectStyle}
                  aria-label={`Role for ${m.name}`}
                >
                  {ROLE_OPTS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                  {m.role === "client" && <option value="client">Client</option>}
                </select>
              ) : (
                <span style={roStyle}>{roleLabel(m.role)}</span>
              )}
              {canManage && !isOwner && (
                <button
                  type="button"
                  onClick={() => remove(m.userId, m.name)}
                  disabled={pending}
                  style={xBtn}
                  title="Remove from team"
                >
                  ✕
                </button>
              )}
            </div>
          );
        })}
      </div>

      {err && <div style={errStyle}>{err}</div>}

      {canManage &&
        (adding ? (
          <form action={invite} style={inviteForm}>
            <input
              name="email"
              type="email"
              placeholder="Email to invite"
              required
              autoComplete="off"
              style={inputStyle}
            />
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <select name="role" defaultValue="member" style={{ ...selectStyle, flex: 1 }}>
                {ROLE_OPTS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
                <option value="client">Client (view &amp; approve)</option>
              </select>
              <button type="submit" disabled={pending} style={primaryBtn}>
                {pending ? "…" : "Invite"}
              </button>
              <button type="button" onClick={() => setAdding(false)} style={ghostBtn}>
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <button type="button" onClick={() => setAdding(true)} style={addBtn}>
            + Add member
          </button>
        ))}
    </div>
  );
}

const rowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "7px 0",
};
const avatar: React.CSSProperties = {
  width: 26,
  height: 26,
  borderRadius: "50%",
  display: "grid",
  placeItems: "center",
  fontSize: 11,
  fontWeight: 700,
  color: "#fff",
  flex: "none",
};
const nameStyle: React.CSSProperties = {
  fontSize: 13.5,
  fontWeight: 600,
  flex: 1,
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};
const selectStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 650,
  height: 28,
  boxSizing: "border-box",
  padding: "4px 6px",
  borderRadius: 7,
  border: "1px solid #d8d8dd",
  background: "#fff",
  color: "#18181b",
  cursor: "pointer",
  flex: "none",
};
const roStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: "#71717a", flex: "none" };
const ownerTag: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: "#9d2b5b",
  flex: "none",
  display: "inline-flex",
  alignItems: "center",
  height: 28,
};
const xBtn: React.CSSProperties = {
  border: "none",
  background: "transparent",
  color: "#b91c1c",
  cursor: "pointer",
  width: 24,
  height: 24,
  borderRadius: 6,
  fontSize: 13,
  flex: "none",
};
const errStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#b91c1c",
  background: "#fef2f2",
  border: "1px solid #fecaca",
  borderRadius: 8,
  padding: "6px 10px",
  marginTop: 6,
};
const inviteForm: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
  marginTop: 8,
  padding: 12,
  border: "1px solid #e4e4e7",
  borderRadius: 10,
  background: "#fff",
};
const inputStyle: React.CSSProperties = {
  fontSize: 13,
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid #d8d8dd",
  background: "#fff",
  color: "#18181b",
};
const primaryBtn: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  background: "#18181b",
  color: "#fff",
  border: "none",
  borderRadius: 8,
  padding: "7px 12px",
  cursor: "pointer",
};
const ghostBtn: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  background: "transparent",
  color: "#3f3f46",
  border: "1px solid #d8d8dd",
  borderRadius: 8,
  padding: "7px 12px",
  cursor: "pointer",
};
const addBtn: React.CSSProperties = {
  ...ghostBtn,
  width: "100%",
  marginTop: 8,
  color: "#71717a",
};
