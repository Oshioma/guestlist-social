"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createAccountInTeam } from "@/lib/auth/team-actions";

type TeamLite = { id: string; name: string };

// A dead-simple "add an account" flow: (1) name it, (2) pick its team,
// (3) connect Instagram/Facebook. Steps 1-2 are one short form; step 3 appears
// after the account is created (connecting needs the new account's id).
export function AddAccountWizard({
  teams,
  base,
}: {
  teams: TeamLite[];
  base: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [teamId, setTeamId] = useState(teams[0]?.id ?? "");
  const [err, setErr] = useState<string | null>(null);
  const [created, setCreated] = useState<{
    clientId: number;
    teamName: string;
    name: string;
  } | null>(null);
  const [pending, start] = useTransition();

  // No teams you can add to → nothing to show (the page explains creating a team).
  if (teams.length === 0) return null;

  function reset() {
    setName("");
    setTeamId(teams[0]?.id ?? "");
    setErr(null);
    setCreated(null);
    setOpen(false);
  }

  function submit() {
    setErr(null);
    const nm = name.trim();
    if (!nm) return setErr("Give the account a name.");
    if (!teamId) return setErr("Choose which team it belongs to.");
    start(async () => {
      const res = await createAccountInTeam(teamId, nm);
      if (res.error || res.fieldError) {
        setErr(res.error ?? res.fieldError ?? "Could not create the account.");
        return;
      }
      const teamName = teams.find((t) => t.id === teamId)?.name ?? "the team";
      setCreated({ clientId: res.clientId!, teamName, name: nm });
    });
  }

  const connectHref = created
    ? `/api/meta/connect?clientId=${created.clientId}&returnTo=${encodeURIComponent(
        `${base}/teams`
      )}`
    : "#";

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} style={addBtn}>
        ＋ Add an account
      </button>
    );
  }

  return (
    <div style={wizardCard}>
      {!created ? (
        <>
          <div style={stepRow}>
            <span style={stepNum}>1</span>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Name this account</label>
              <p style={hintStyle}>
                The brand or business you&rsquo;re posting for — e.g. &ldquo;Beach Bar&rdquo;.
              </p>
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Beach Bar"
                style={inputStyle}
                onKeyDown={(e) => e.key === "Enter" && submit()}
              />
            </div>
          </div>

          <div style={stepRow}>
            <span style={stepNum}>2</span>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Which team is it in?</label>
              <p style={hintStyle}>
                A team is the folder that holds this account and the people allowed
                to work on it.
              </p>
              <select
                value={teamId}
                onChange={(e) => setTeamId(e.target.value)}
                style={inputStyle}
              >
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {err && <div style={errBox}>{err}</div>}

          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            <button type="button" onClick={submit} disabled={pending} style={primaryBtn(pending)}>
              {pending ? "Creating…" : "Create account →"}
            </button>
            <button type="button" onClick={reset} disabled={pending} style={ghostBtn}>
              Cancel
            </button>
          </div>
        </>
      ) : (
        <>
          <div style={successBox}>
            ✓ <strong>{created.name}</strong> was added to{" "}
            <strong>{created.teamName}</strong>.
          </div>

          <div style={stepRow}>
            <span style={{ ...stepNum, background: "#18181b" }}>3</span>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Connect Instagram / Facebook</label>
              <p style={hintStyle}>
                This is the step that lets posts actually publish. It opens
                Meta&rsquo;s secure login — pick the Facebook Page and its linked
                Instagram, and you&rsquo;re done. You can also do this later.
              </p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
                <a href={connectHref} style={connectBtn}>
                  Connect Instagram / Facebook →
                </a>
                <button
                  type="button"
                  onClick={() => {
                    router.refresh();
                    reset();
                  }}
                  style={ghostBtn}
                >
                  I&rsquo;ll connect later
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── styles ───────────────────────────────────────────────────────────────────

const addBtn: React.CSSProperties = {
  background: "#18181b",
  color: "#fff",
  border: "none",
  borderRadius: 10,
  padding: "10px 16px",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
};

const wizardCard: React.CSSProperties = {
  border: "1px solid #e4e4e7",
  borderRadius: 12,
  padding: 16,
  background: "#fafafa",
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

const stepRow: React.CSSProperties = {
  display: "flex",
  gap: 12,
  alignItems: "flex-start",
};

const stepNum: React.CSSProperties = {
  flex: "0 0 auto",
  width: 24,
  height: 24,
  borderRadius: 999,
  background: "#a1a1aa",
  color: "#fff",
  fontSize: 13,
  fontWeight: 700,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  marginTop: 2,
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 14,
  fontWeight: 600,
  color: "#27272a",
};

const hintStyle: React.CSSProperties = {
  margin: "2px 0 8px",
  fontSize: 12.5,
  color: "#71717a",
  lineHeight: 1.5,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "9px 12px",
  border: "1px solid #d4d4d8",
  borderRadius: 9,
  fontSize: 14,
  color: "#18181b",
  background: "#fff",
};

const errBox: React.CSSProperties = {
  padding: "9px 12px",
  borderRadius: 9,
  background: "#fef2f2",
  border: "1px solid #fecaca",
  color: "#b91c1c",
  fontSize: 13,
};

const successBox: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 9,
  background: "#f0fdf4",
  border: "1px solid #bbf7d0",
  color: "#15803d",
  fontSize: 13.5,
};

function primaryBtn(disabled: boolean): React.CSSProperties {
  return {
    background: disabled ? "#a1a1aa" : "#18181b",
    color: "#fff",
    border: "none",
    borderRadius: 9,
    padding: "10px 16px",
    fontSize: 14,
    fontWeight: 600,
    cursor: disabled ? "default" : "pointer",
  };
}

const ghostBtn: React.CSSProperties = {
  background: "#fff",
  color: "#3f3f46",
  border: "1px solid #e4e4e7",
  borderRadius: 9,
  padding: "10px 16px",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
};

const connectBtn: React.CSSProperties = {
  background: "#18181b",
  color: "#fff",
  borderRadius: 9,
  padding: "10px 16px",
  fontSize: 14,
  fontWeight: 600,
  textDecoration: "none",
  display: "inline-block",
};
