"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { renameTeam, deleteTeam } from "@/lib/auth/team-actions";

// The team name in the card header, with inline rename (pencil) and delete
// (trash) for managers. Rename edits in place; delete calls deleteTeam, which
// refuses unless the team has been emptied of accounts and extra members first
// — we just surface that message.
export function TeamHeaderActions({
  teamId,
  name,
  canManage,
}: {
  teamId: string;
  name: string;
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const [err, setErr] = useState<string | null>(null);

  function save() {
    const next = value.trim();
    if (!next || next === name) {
      setEditing(false);
      setValue(name);
      return;
    }
    setErr(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("teamId", teamId);
      fd.set("name", next);
      const res = await renameTeam(null, fd);
      if (res?.error) setErr(res.error);
      else {
        setEditing(false);
        router.refresh();
      }
    });
  }

  function del() {
    if (!window.confirm(`Delete the team “${name}”? This can’t be undone.`)) return;
    setErr(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("teamId", teamId);
      const res = await deleteTeam(null, fd);
      if (res?.error) setErr(res.error);
      else router.refresh();
    });
  }

  if (!canManage) {
    return <span style={{ fontSize: 16, fontWeight: 700 }}>{name}</span>;
  }

  if (editing) {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        <input
          autoFocus
          value={value}
          disabled={pending}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") {
              setEditing(false);
              setValue(name);
            }
          }}
          style={editInput}
        />
        <button type="button" onClick={save} disabled={pending} style={saveBtn}>
          {pending ? "…" : "Save"}
        </button>
        <button
          type="button"
          onClick={() => {
            setEditing(false);
            setValue(name);
          }}
          style={cancelBtn}
        >
          Cancel
        </button>
        {err && <span style={errText}>{err}</span>}
      </span>
    );
  }

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span style={{ fontSize: 16, fontWeight: 700 }}>{name}</span>
      <button
        type="button"
        onClick={() => setEditing(true)}
        disabled={pending}
        style={iconBtn}
        title="Rename team"
        aria-label="Rename team"
      >
        ✎
      </button>
      <button
        type="button"
        onClick={del}
        disabled={pending}
        style={{ ...iconBtn, color: "#b91c1c" }}
        title="Delete team"
        aria-label="Delete team"
      >
        🗑
      </button>
      {err && <span style={errText}>{err}</span>}
    </span>
  );
}

const editInput: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 600,
  padding: "4px 8px",
  borderRadius: 7,
  border: "1px solid #d8d8dd",
  background: "#fff",
  color: "#18181b",
  minWidth: 160,
};
const iconBtn: React.CSSProperties = {
  border: "none",
  background: "transparent",
  color: "#a1a1aa",
  cursor: "pointer",
  fontSize: 13,
  padding: 2,
  lineHeight: 1,
};
const saveBtn: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  background: "#18181b",
  color: "#fff",
  border: "none",
  borderRadius: 7,
  padding: "5px 10px",
  cursor: "pointer",
};
const cancelBtn: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  background: "transparent",
  color: "#3f3f46",
  border: "1px solid #d8d8dd",
  borderRadius: 7,
  padding: "5px 10px",
  cursor: "pointer",
};
const errText: React.CSSProperties = {
  fontSize: 12,
  color: "#b91c1c",
  fontWeight: 500,
};
