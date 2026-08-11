"use client";

import { useState, useTransition } from "react";
import { startAccountConnect } from "@/lib/auth/team-actions";

// Connect-first "add an account" for a team. There's no naming step: you pick
// Facebook or Instagram, log in, and the Meta picker adds the account (named
// after the Page/handle) to this team. So the accounts list only ever shows
// real, connected accounts.
export function AddAccountInline({
  teamId,
  igConfigured,
}: {
  teamId: string;
  igConfigured: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function go(platform: "facebook" | "instagram") {
    setErr(null);
    startTransition(async () => {
      const res = await startAccountConnect(teamId, platform);
      if (res?.error || !res?.url) {
        setErr(res?.error ?? "Could not start connecting.");
        return;
      }
      window.location.href = res.url;
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
      <p style={hint}>
        Log in and pick the account — we&rsquo;ll add it here. Connecting Facebook
        brings its linked Instagram too.
      </p>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <button type="button" onClick={() => go("facebook")} disabled={pending} style={fbBtn}>
          {pending ? "…" : "Connect Facebook"}
        </button>
        {igConfigured && (
          <button type="button" onClick={() => go("instagram")} disabled={pending} style={igBtn}>
            {pending ? "…" : "Connect Instagram"}
          </button>
        )}
        <button type="button" onClick={() => { setOpen(false); setErr(null); }} style={ghost}>
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
const hint: React.CSSProperties = {
  margin: 0,
  fontSize: 12,
  color: "#71717a",
  lineHeight: 1.45,
};
const baseBtn: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: "#fff",
  border: "none",
  borderRadius: 8,
  padding: "7px 12px",
  cursor: "pointer",
};
const fbBtn: React.CSSProperties = { ...baseBtn, background: "#1877F2" };
const igBtn: React.CSSProperties = { ...baseBtn, background: "#c13584" };
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
