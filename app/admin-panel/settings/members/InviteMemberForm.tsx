"use client";

import { useActionState } from "react";
import { inviteMember, type ActionState } from "@/lib/auth/member-actions";

export function InviteMemberForm() {
  const [state, action, isPending] = useActionState<ActionState | null, FormData>(
    inviteMember,
    null
  );

  return (
    <form action={action} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {state?.error && (
        <div style={errorBoxStyle}>{state.error}</div>
      )}
      {state?.success && state.message && (
        <div style={successBoxStyle}>{state.message}</div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 160px", gap: 8 }}>
        <div>
          <label style={labelStyle}>Email</label>
          <input
            name="email"
            type="email"
            required
            placeholder="teammate@guestlistsocial.com"
            style={inputStyle}
          />
          {state?.fieldErrors?.email && (
            <span style={fieldErrorStyle}>{state.fieldErrors.email[0]}</span>
          )}
        </div>
        <div>
          <label style={labelStyle}>Role</label>
          <select name="role" defaultValue="member" style={inputStyle}>
            <option value="member">Member</option>
            <option value="admin">Admin</option>
          </select>
        </div>
      </div>

      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 13,
          color: "#3f3f46",
          cursor: "pointer",
          padding: "8px 0",
        }}
      >
        <input type="checkbox" name="canRunAds" />
        <span>Allow this person to create and edit ads</span>
      </label>

      <button
        type="submit"
        disabled={isPending}
        style={{
          alignSelf: "flex-start",
          background: "#18181b",
          color: "#fff",
          border: "none",
          borderRadius: 8,
          padding: "9px 16px",
          fontSize: 13,
          fontWeight: 600,
          cursor: isPending ? "wait" : "pointer",
          opacity: isPending ? 0.7 : 1,
        }}
      >
        {isPending ? "Sending invite…" : "Send invite"}
      </button>
    </form>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  color: "#71717a",
  marginBottom: 4,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  border: "1px solid #e4e4e7",
  borderRadius: 8,
  padding: "8px 10px",
  fontSize: 13,
  background: "#fff",
  color: "#18181b",
  boxSizing: "border-box",
};

const errorBoxStyle: React.CSSProperties = {
  padding: "8px 10px",
  borderRadius: 8,
  background: "#fef2f2",
  border: "1px solid #fecaca",
  color: "#b91c1c",
  fontSize: 12,
};

const successBoxStyle: React.CSSProperties = {
  padding: "8px 10px",
  borderRadius: 8,
  background: "#f0fdf4",
  border: "1px solid #bbf7d0",
  color: "#15803d",
  fontSize: 12,
};

const fieldErrorStyle: React.CSSProperties = {
  display: "block",
  marginTop: 4,
  fontSize: 11,
  color: "#b91c1c",
};
