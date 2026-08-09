"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { UserOverviewRow } from "@/lib/admin/users-overview";
import { deleteUserFullyAction } from "./user-actions";

export default function UsersOverview({
  users,
  base,
}: {
  users: UserOverviewRow[];
  base: string;
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [result, setResult] = useState<{ id: string; text: string; ok: boolean } | null>(null);
  const [, startTransition] = useTransition();

  function handleDelete(id: string) {
    setBusyId(id);
    setResult(null);
    startTransition(async () => {
      const res = await deleteUserFullyAction(id);
      setBusyId(null);
      setConfirmId(null);
      if (res.ok) {
        setResult({ id, text: res.message, ok: true });
        router.refresh();
      } else {
        setResult({ id, text: res.error, ok: false });
      }
    });
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.email.toLowerCase().includes(q) ||
        u.teams.some(
          (t) =>
            t.name.toLowerCase().includes(q) ||
            t.accounts.some((a) => a.name.toLowerCase().includes(q))
        )
    );
  }, [users, query]);

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (users.length === 0) {
    return <p style={{ fontSize: 14, color: "#71717a" }}>No users yet.</p>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search users, teams or accounts…"
          style={searchStyle}
        />
        <span style={{ fontSize: 12, color: "#a1a1aa" }}>
          {filtered.length} of {users.length}
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {filtered.map((u) => {
          const open = expanded.has(u.id);
          return (
            <div key={u.id} style={rowCard}>
              <button
                type="button"
                onClick={() => toggle(u.id)}
                style={rowHeader}
                aria-expanded={open}
              >
                <span style={{ ...chevron, transform: open ? "rotate(90deg)" : "none" }}>▸</span>

                <span style={{ display: "flex", flexDirection: "column", minWidth: 0, flex: "1 1 220px" }}>
                  <span style={emailStyle}>{u.email}</span>
                  <span style={metaStyle}>
                    {u.joinedAt ? `Joined ${formatDate(u.joinedAt)}` : "—"}
                    {" · "}
                    {u.teamCount} {u.teamCount === 1 ? "team" : "teams"}
                    {" · "}
                    {u.accountCount} {u.accountCount === 1 ? "account" : "accounts"}
                  </span>
                </span>

                <span style={{ display: "flex", alignItems: "center", gap: 10, flex: "1 1 200px", justifyContent: "flex-end" }}>
                  <span style={progressWrap}>
                    <span
                      style={{
                        ...progressFill,
                        width: `${u.progressPct ?? 0}%`,
                        background: u.isStaff ? "#a1a1aa" : progressColor(u.progressPct ?? 0),
                      }}
                    />
                  </span>
                  <span style={progressLabelStyle}>{u.progressLabel}</span>
                </span>
              </button>

              {open && (
                <div style={rowBody}>
                  {u.teams.length === 0 ? (
                    <p style={{ fontSize: 13, color: "#a1a1aa", margin: 0 }}>
                      No teams or accounts yet.
                    </p>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      {u.teams.map((t) => (
                        <div key={t.id} style={teamBlock}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                            <span style={teamName}>{t.name}</span>
                            <span style={badge}>{t.isOwner ? "owner" : t.role}</span>
                            <span style={{ ...badge, background: t.plan === "pro" ? "#ecfccb" : "#f4f4f5", color: t.plan === "pro" ? "#3f6212" : "#71717a" }}>
                              {t.plan}
                            </span>
                            <Link
                              href={`${base}/teams/${t.id}`}
                              style={{ marginLeft: "auto", fontSize: 12, fontWeight: 600, color: "#3f3f46", textDecoration: "none", whiteSpace: "nowrap" }}
                            >
                              Manage &rarr;
                            </Link>
                          </div>
                          {t.accounts.length === 0 ? (
                            <p style={{ fontSize: 12, color: "#a1a1aa", margin: "6px 0 0" }}>
                              No accounts.
                            </p>
                          ) : (
                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                              {t.accounts.map((a) => (
                                <span key={a.id} style={accountChip}>
                                  {a.name}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  <p style={{ fontSize: 11, color: "#c4c4cc", margin: "10px 0 0" }}>
                    User ID: {u.id}
                  </p>

                  <div style={{ marginTop: 12, borderTop: "1px solid #f4f4f5", paddingTop: 12 }}>
                    {confirmId === u.id ? (
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <span style={{ fontSize: 12.5, color: "#b91c1c", fontWeight: 600, flex: "1 1 260px" }}>
                          Permanently delete <strong>{u.email}</strong> and all their teams,
                          accounts and posts? This can&apos;t be undone.
                        </span>
                        <button
                          type="button"
                          onClick={() => handleDelete(u.id)}
                          disabled={busyId === u.id}
                          style={dangerBtn}
                        >
                          {busyId === u.id ? "Deleting…" : "Delete permanently"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmId(null)}
                          disabled={busyId === u.id}
                          style={cancelBtn}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setConfirmId(u.id);
                          setResult(null);
                        }}
                        style={deleteLinkBtn}
                      >
                        Delete user…
                      </button>
                    )}
                    {result && result.id === u.id && (
                      <p style={{ fontSize: 12, margin: "8px 0 0", color: result.ok ? "#166534" : "#b91c1c" }}>
                        {result.text}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function progressColor(pct: number): string {
  if (pct >= 100) return "#22c55e";
  if (pct >= 50) return "#84cc16";
  if (pct > 0) return "#f59e0b";
  return "#e4e4e7";
}

// ── styles ───────────────────────────────────────────────────────────────────

const searchStyle: React.CSSProperties = {
  flex: "1 1 260px",
  maxWidth: 360,
  padding: "8px 12px",
  border: "1px solid #d4d4d8",
  borderRadius: 9,
  fontSize: 13,
  color: "#1e293b",
};

const rowCard: React.CSSProperties = {
  border: "1px solid #e4e4e7",
  borderRadius: 12,
  background: "#fff",
  overflow: "hidden",
};

const rowHeader: React.CSSProperties = {
  width: "100%",
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "12px 14px",
  background: "none",
  border: "none",
  cursor: "pointer",
  textAlign: "left",
  flexWrap: "wrap",
};

const chevron: React.CSSProperties = {
  color: "#a1a1aa",
  fontSize: 12,
  transition: "transform 120ms ease",
  flex: "0 0 auto",
};

const emailStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  color: "#1e293b",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const metaStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#a1a1aa",
};

const progressWrap: React.CSSProperties = {
  width: 120,
  height: 8,
  borderRadius: 999,
  background: "#f1f1f4",
  overflow: "hidden",
  flex: "0 0 auto",
};

const progressFill: React.CSSProperties = {
  display: "block",
  height: "100%",
  borderRadius: 999,
  transition: "width 200ms ease",
};

const progressLabelStyle: React.CSSProperties = {
  fontSize: 11,
  color: "#71717a",
  minWidth: 96,
  textAlign: "right",
};

const rowBody: React.CSSProperties = {
  padding: "4px 16px 16px 34px",
  borderTop: "1px solid #f4f4f5",
};

const teamBlock: React.CSSProperties = {
  border: "1px solid #f0f0f2",
  borderRadius: 10,
  padding: "10px 12px",
  background: "#fafafa",
};

const teamName: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: "#27272a",
};

const badge: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: "#71717a",
  background: "#f4f4f5",
  borderRadius: 999,
  padding: "2px 8px",
  textTransform: "capitalize",
};

const accountChip: React.CSSProperties = {
  fontSize: 12,
  color: "#3f3f46",
  background: "#fff",
  border: "1px solid #e4e4e7",
  borderRadius: 8,
  padding: "4px 9px",
};

const deleteLinkBtn: React.CSSProperties = {
  background: "none",
  border: "none",
  padding: 0,
  fontSize: 12.5,
  fontWeight: 600,
  color: "#b91c1c",
  cursor: "pointer",
  textDecoration: "underline",
};

const dangerBtn: React.CSSProperties = {
  background: "#b91c1c",
  color: "#fff",
  border: "1px solid #b91c1c",
  borderRadius: 8,
  padding: "7px 14px",
  fontSize: 12.5,
  fontWeight: 700,
  cursor: "pointer",
};

const cancelBtn: React.CSSProperties = {
  background: "#fff",
  color: "#3f3f46",
  border: "1px solid #d4d4d8",
  borderRadius: 8,
  padding: "7px 14px",
  fontSize: 12.5,
  fontWeight: 700,
  cursor: "pointer",
};
