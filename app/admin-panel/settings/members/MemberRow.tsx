"use client";

import { useState, useTransition } from "react";
import { updateMember, removeMember } from "@/lib/auth/member-actions";

type Member = {
  userId: string;
  email: string;
  fullName: string | null;
  role: "admin" | "member";
  canRunAds: boolean;
  createdAt: string;
  isSelf: boolean;
};

export function MemberRow({ member }: { member: Member }) {
  const [role, setRole] = useState<"admin" | "member">(member.role);
  const [canRunAds, setCanRunAds] = useState<boolean>(member.canRunAds);
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const dirty = role !== member.role || canRunAds !== member.canRunAds;

  function save() {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("userId", member.userId);
      fd.set("role", role);
      if (canRunAds) fd.set("canRunAds", "on");
      const result = await updateMember(null, fd);
      if (result.error) {
        setMessage({ kind: "err", text: result.error });
      } else {
        setMessage({ kind: "ok", text: "Saved." });
        setTimeout(() => setMessage(null), 2500);
      }
    });
  }

  function remove() {
    if (!confirm(`Remove ${member.email}? This deletes the user from Supabase.`)) return;
    startTransition(async () => {
      const fd = new FormData();
      fd.set("userId", member.userId);
      const result = await removeMember(null, fd);
      if (result.error) {
        setMessage({ kind: "err", text: result.error });
      }
    });
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 140px 180px 80px",
        alignItems: "center",
        gap: 12,
        padding: "10px 14px",
        border: "1px solid #e4e4e7",
        borderRadius: 10,
        background: "#fafafa",
      }}
    >
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#18181b" }}>
          {member.fullName ?? member.email}
          {member.isSelf && (
            <span style={{ marginLeft: 6, fontSize: 10, color: "#52525b" }}>(you)</span>
          )}
        </div>
        {member.fullName && (
          <div style={{ fontSize: 12, color: "#71717a" }}>{member.email}</div>
        )}
        {message && (
          <div
            style={{
              marginTop: 4,
              fontSize: 11,
              color: message.kind === "ok" ? "#15803d" : "#b91c1c",
            }}
          >
            {message.text}
          </div>
        )}
      </div>

      <select
        value={role}
        disabled={isPending || member.isSelf}
        onChange={(e) => setRole(e.target.value as "admin" | "member")}
        style={selectStyle}
        title={member.isSelf ? "You can't change your own role" : ""}
      >
        <option value="member">Member</option>
        <option value="admin">Admin</option>
      </select>

      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#3f3f46" }}>
        <input
          type="checkbox"
          checked={canRunAds}
          onChange={(e) => setCanRunAds(e.target.checked)}
          disabled={isPending}
        />
        Can run ads
      </label>

      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
        {dirty && (
          <button onClick={save} disabled={isPending} style={btnStyle("#18181b", "#fff")}>
            Save
          </button>
        )}
        {!member.isSelf && (
          <button onClick={remove} disabled={isPending} style={btnStyle("#fff", "#b91c1c", "#fecaca")}>
            Remove
          </button>
        )}
      </div>
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  border: "1px solid #e4e4e7",
  borderRadius: 6,
  padding: "5px 8px",
  fontSize: 12,
  background: "#fff",
  color: "#18181b",
};

function btnStyle(bg: string, fg: string, border?: string): React.CSSProperties {
  return {
    background: bg,
    color: fg,
    border: `1px solid ${border ?? bg}`,
    borderRadius: 6,
    padding: "5px 10px",
    fontSize: 12,
    fontWeight: 500,
    cursor: "pointer",
  };
}
