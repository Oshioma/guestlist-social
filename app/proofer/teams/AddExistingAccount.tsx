"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setTeamAccount } from "@/lib/auth/team-actions";

// Link an account that already lives in another team to THIS team too. The
// account isn't moved or copied — it's the same account, now visible to both
// teams' members (posts, connections and history are shared). This is how you
// give each client their own team: keep the account in your main team for your
// creators, and also add it to a client-only team where you invite the client.
//
// Options are limited to accounts in teams the viewer manages; the server
// action re-checks that, so the list is a convenience, not the gate.
export function AddExistingAccount({
  teamId,
  options,
}: {
  teamId: string;
  options: { id: number; name: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [clientId, setClientId] = useState("");

  if (options.length === 0) return null;

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} style={linkBtn}>
        + Add an existing account
      </button>
    );
  }

  function add() {
    if (!clientId) return;
    startTransition(async () => {
      const fd = new FormData();
      fd.set("teamId", teamId);
      fd.set("clientId", clientId);
      fd.set("action", "add");
      const res = await setTeamAccount(null, fd);
      if (res?.error) {
        window.alert(res.error);
        return;
      }
      setClientId("");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <div style={row}>
      <select
        value={clientId}
        onChange={(e) => setClientId(e.target.value)}
        disabled={pending}
        style={select}
        aria-label="Account to add to this team"
      >
        <option value="">Choose an account…</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
      <button type="button" onClick={add} disabled={pending || !clientId} style={primaryBtn}>
        {pending ? "…" : "Add"}
      </button>
      <button
        type="button"
        onClick={() => {
          setOpen(false);
          setClientId("");
        }}
        disabled={pending}
        style={ghostBtn}
      >
        Cancel
      </button>
    </div>
  );
}

const linkBtn: React.CSSProperties = {
  marginTop: 10,
  padding: 0,
  border: "none",
  background: "transparent",
  color: "#52525b",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
  alignSelf: "flex-start",
};

const row: React.CSSProperties = {
  display: "flex",
  gap: 6,
  flexWrap: "wrap",
  marginTop: 10,
};

const select: React.CSSProperties = {
  flex: 1,
  minWidth: 160,
  padding: "6px 8px",
  fontSize: 13,
  border: "1px solid #d4d4d8",
  borderRadius: 8,
  background: "#fff",
};

const primaryBtn: React.CSSProperties = {
  padding: "6px 12px",
  fontSize: 13,
  fontWeight: 600,
  color: "#fff",
  background: "#18181b",
  border: "none",
  borderRadius: 8,
  cursor: "pointer",
};

const ghostBtn: React.CSSProperties = {
  padding: "6px 12px",
  fontSize: 13,
  color: "#52525b",
  background: "transparent",
  border: "1px solid #e4e4e7",
  borderRadius: 8,
  cursor: "pointer",
};
