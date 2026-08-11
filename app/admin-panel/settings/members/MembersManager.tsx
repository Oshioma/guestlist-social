"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { inviteMember, updateMember, removeMember } from "@/lib/auth/member-actions";

export type MemberRecord = {
  userId: string;
  email: string;
  fullName: string | null;
  role: "admin" | "member";
  canRunAds: boolean;
  createdAt: string;
  isSelf: boolean;
};

// Agency staff roles, with a colour dot in the dropdown to match the Teams
// page: green = full admin access, yellow = member (day-to-day staff).
const ROLE_OPTS = [
  { value: "admin", label: "🟢 Admin" },
  { value: "member", label: "🟡 Member" },
];

function roleLabel(role: string): string {
  return role === "admin" ? "🟢 Admin" : "🟡 Member";
}

const AV = ["#4f46e5", "#0ea5e9", "#e11d48", "#16a34a", "#d97706", "#7c3aed"];
const avColor = (s: string) =>
  AV[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % AV.length];
const initials = (s: string) =>
  s.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase() || "?";

export function MembersManager({ members }: { members: MemberRecord[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  // Persist a member's role and/or ads flag together — updateMember takes both.
  function persist(m: MemberRecord, next: { role?: string; canRunAds?: boolean }) {
    setErr(null);
    setOk(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("userId", m.userId);
      fd.set("role", next.role ?? m.role);
      if (next.canRunAds ?? m.canRunAds) fd.set("canRunAds", "on");
      const res = await updateMember(null, fd);
      if (res?.error) setErr(res.error);
      else router.refresh();
    });
  }

  function remove(m: MemberRecord) {
    if (!window.confirm(`Remove ${m.email}? This deletes the user from Supabase.`)) return;
    setErr(null);
    setOk(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("userId", m.userId);
      const res = await removeMember(null, fd);
      if (res?.error) setErr(res.error);
      else router.refresh();
    });
  }

  function invite(formData: FormData) {
    setErr(null);
    setOk(null);
    startTransition(async () => {
      const res = await inviteMember(null, formData);
      if (res?.error) setErr(res.error);
      else if (res?.fieldErrors?.email) setErr(res.fieldErrors.email[0] ?? "Enter a valid email.");
      else {
        setAdding(false);
        setOk(res?.message ?? "Invite sent.");
        router.refresh();
      }
    });
  }

  return (
    <div>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {members.map((m) => {
          const name = m.fullName ?? m.email;
          return (
            <div key={m.userId} style={rowStyle}>
              <span style={{ ...avatar, background: avColor(name) }}>{initials(name)}</span>
              <span style={nameCol}>
                <span style={nameStyle}>
                  {name}
                  {m.isSelf && <span style={youTag}>you</span>}
                </span>
                {m.fullName && <span style={subStyle}>{m.email}</span>}
              </span>

              <button
                type="button"
                onClick={() => persist(m, { canRunAds: !m.canRunAds })}
                disabled={pending}
                style={m.canRunAds ? adsOn : adsOff}
                title={m.canRunAds ? "Can create and edit ads — click to revoke" : "Cannot run ads — click to allow"}
              >
                {m.canRunAds ? "Ads ✓" : "Ads"}
              </button>

              {m.isSelf ? (
                <span style={roleBoxStatic} title="You can't change your own role">
                  {roleLabel(m.role)}
                </span>
              ) : (
                <select
                  value={m.role}
                  disabled={pending}
                  onChange={(e) => persist(m, { role: e.target.value })}
                  style={roleSelect}
                  aria-label={`Role for ${name}`}
                >
                  {ROLE_OPTS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              )}

              {m.isSelf ? (
                <span style={xGhost} aria-hidden="true" />
              ) : (
                <button
                  type="button"
                  onClick={() => remove(m)}
                  disabled={pending}
                  style={xBtn}
                  title="Remove member"
                >
                  ✕
                </button>
              )}
            </div>
          );
        })}
      </div>

      {err && <div style={errStyle}>{err}</div>}
      {ok && <div style={okStyle}>{ok}</div>}

      {adding ? (
        <form action={invite} style={inviteForm}>
          <input
            name="email"
            type="email"
            placeholder="teammate@guestlistsocial.com"
            required
            autoComplete="off"
            style={inputStyle}
          />
          <label style={adsCheck}>
            <input type="checkbox" name="canRunAds" />
            Allow this person to create and edit ads
          </label>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <select name="role" defaultValue="member" style={{ ...roleSelect, width: "auto", flex: 1 }}>
              {ROLE_OPTS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <button type="submit" disabled={pending} style={primaryBtn}>
              {pending ? "…" : "Send invite"}
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
      )}
    </div>
  );
}

const rowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "8px 0",
};
const avatar: React.CSSProperties = {
  width: 30,
  height: 30,
  borderRadius: "50%",
  display: "grid",
  placeItems: "center",
  fontSize: 12,
  fontWeight: 700,
  color: "#fff",
  flex: "none",
};
const nameCol: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  flex: 1,
  minWidth: 0,
};
const nameStyle: React.CSSProperties = {
  fontSize: 13.5,
  fontWeight: 600,
  color: "#18181b",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};
const subStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#71717a",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};
const youTag: React.CSSProperties = {
  marginLeft: 6,
  fontSize: 10,
  fontWeight: 700,
  color: "#4451b8",
  background: "#eef2ff",
  border: "1px solid #dbe2fb",
  borderRadius: 999,
  padding: "1px 6px",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};
// Role controls share one fixed width so the leading dot lines up down the
// column, matching the Teams page members list.
const roleSelect: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 650,
  height: 28,
  width: 116,
  boxSizing: "border-box",
  padding: "4px 8px",
  borderRadius: 7,
  border: "1px solid #d8d8dd",
  background: "#fff",
  color: "#18181b",
  cursor: "pointer",
  flex: "none",
};
const roleBoxStatic: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 650,
  height: 28,
  width: 116,
  boxSizing: "border-box",
  padding: "4px 8px",
  borderRadius: 7,
  border: "1px solid #e4e4e7",
  background: "#fafafa",
  color: "#3f3f46",
  display: "inline-flex",
  alignItems: "center",
  flex: "none",
};
const adsBase: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  height: 28,
  boxSizing: "border-box",
  padding: "0 10px",
  borderRadius: 7,
  cursor: "pointer",
  flex: "none",
};
const adsOn: React.CSSProperties = {
  ...adsBase,
  background: "#e4f1ea",
  color: "#2f7d5b",
  border: "1px solid #bfe0cd",
};
const adsOff: React.CSSProperties = {
  ...adsBase,
  background: "#fff",
  color: "#a1a1aa",
  border: "1px solid #e4e4e7",
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
const xGhost: React.CSSProperties = { width: 24, height: 24, flex: "none" };
const errStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#b91c1c",
  background: "#fef2f2",
  border: "1px solid #fecaca",
  borderRadius: 8,
  padding: "6px 10px",
  marginTop: 6,
};
const okStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#15803d",
  background: "#f0fdf4",
  border: "1px solid #bbf7d0",
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
const adsCheck: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontSize: 13,
  color: "#3f3f46",
  cursor: "pointer",
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
