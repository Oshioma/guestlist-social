"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createAccountInTeam } from "@/lib/auth/team-actions";

// Small inline "add an account" for a team card — creates a named account
// (client) inside this team. Connecting it to Meta happens afterwards from the
// account's Facebook/Instagram cells.
export function AddAccountInline({ teamId }: { teamId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [err, setErr] = useState<string | null>(null);

  function submit() {
    const n = name.trim();
    if (!n) return;
    setErr(null);
    startTransition(async () => {
      const res = await createAccountInTeam(teamId, n);
      if (res?.error || res?.fieldError) {
        setErr(res.error ?? res.fieldError ?? "Could not add the account.");
        return;
      }
      setName("");
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} style={addBtn}>
        + Add account
      </button>
    );
  }

  return (
    <div style={wrap}>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
          if (e.key === "Escape") setOpen(false);
        }}
        placeholder="Account / brand name"
        autoFocus
        style={input}
      />
      <div style={{ display: "flex", gap: 6 }}>
        <button type="button" onClick={submit} disabled={pending} style={primary}>
          {pending ? "Adding…" : "Add"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setErr(null);
          }}
          style={ghost}
        >
          Cancel
        </button>
      </div>
      {err && <span style={{ fontSize: 11, color: "#b91c1c" }}>{err}</span>}
    </div>
  );
}

const addBtn: React.CSSProperties = {
  marginTop: 10,
  fontSize: 12,
  fontWeight: 700,
  color: "#71717a",
  background: "transparent",
  border: "1px dashed #d8d8dd",
  borderRadius: 8,
  padding: "7px 12px",
  cursor: "pointer",
};
const wrap: React.CSSProperties = {
  marginTop: 10,
  display: "flex",
  flexDirection: "column",
  gap: 8,
  padding: 10,
  border: "1px solid #e4e4e7",
  borderRadius: 10,
  background: "#fff",
};
const input: React.CSSProperties = {
  fontSize: 13,
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid #d8d8dd",
  background: "#fff",
  color: "#18181b",
};
const primary: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  background: "#18181b",
  color: "#fff",
  border: "none",
  borderRadius: 8,
  padding: "7px 12px",
  cursor: "pointer",
};
const ghost: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  background: "transparent",
  color: "#3f3f46",
  border: "1px solid #d8d8dd",
  borderRadius: 8,
  padding: "7px 12px",
  cursor: "pointer",
};
