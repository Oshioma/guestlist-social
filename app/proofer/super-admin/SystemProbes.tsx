"use client";

import { useState } from "react";

type Probe = { name: string; ok: boolean; detail: string; ms: number; skipped?: boolean };

type MetaApp = {
  role: string;
  vars: string[];
  appId: string | null;
  appName: string | null;
  status: "ok" | "warn" | "error" | "missing";
  detail: string;
};

const APP_STATUS: Record<MetaApp["status"], { bg: string; border: string; mark: string }> = {
  ok: { bg: "#f0fdf4", border: "#bbf7d0", mark: "✅" },
  warn: { bg: "#fffbeb", border: "#fde68a", mark: "⚠️" },
  error: { bg: "#fef2f2", border: "#fecaca", mark: "❌" },
  missing: { bg: "#fafafa", border: "#e4e4e7", mark: "—" },
};

/**
 * Configuration looking right is not the same as it working, so the live
 * probes are a deliberate click rather than something the page does on load —
 * they cost third-party round trips.
 */
export default function SystemProbes() {
  const [probes, setProbes] = useState<Probe[] | null>(null);
  const [metaApps, setMetaApps] = useState<MetaApp[] | null>(null);
  const [ranAt, setRanAt] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch("/api/system-checks", { cache: "no-store" });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const data = await res.json();
      setProbes(data.probes ?? []);
      setMetaApps(data.metaApps ?? []);
      setRanAt(data.ranAt ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={run}
          disabled={running}
          style={{
            border: "none",
            borderRadius: 10,
            padding: "9px 16px",
            background: "#18181b",
            color: "#fff",
            fontSize: 13,
            fontWeight: 600,
            cursor: running ? "wait" : "pointer",
          }}
        >
          {running ? "Checking…" : "Run live checks"}
        </button>
        <span style={{ fontSize: 12, color: "#71717a" }}>
          {ranAt
            ? `Last run ${new Date(ranAt).toLocaleTimeString()}`
            : "Calls each service to prove the keys work, not just that they exist."}
        </span>
      </div>

      {error && (
        <div style={{ fontSize: 13, color: "#991b1b", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, padding: "10px 12px" }}>
          Could not run the checks — {error}
        </div>
      )}

      {metaApps && metaApps.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#18181b" }}>
            Your Meta apps — which is which
          </div>
          <div style={{ fontSize: 12, color: "#71717a", lineHeight: 1.5 }}>
            Names come from Meta. An app id and secret only verify together, so
            a name appearing here also proves that pair is correct.
          </div>
          {metaApps.map((a) => {
            const style = APP_STATUS[a.status];
            return (
              <div
                key={a.role}
                style={{
                  border: `1px solid ${style.border}`,
                  background: style.bg,
                  borderRadius: 10,
                  padding: "10px 12px",
                  display: "flex",
                  gap: 10,
                  alignItems: "flex-start",
                }}
              >
                <span style={{ fontSize: 13, flexShrink: 0 }}>{style.mark}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#18181b" }}>
                    {a.appName ?? "Unnamed app"}
                    {a.appId && (
                      <span style={{ fontWeight: 400, color: "#71717a" }}> · {a.appId}</span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: "#3f3f46", marginTop: 2 }}>
                    Used for: <strong style={{ fontWeight: 600 }}>{a.role}</strong>
                  </div>
                  <div style={{ fontSize: 12, color: "#52525b", lineHeight: 1.5, marginTop: 2 }}>
                    {a.detail}
                  </div>
                  <div style={{ fontSize: 11, color: "#a1a1aa", marginTop: 4, wordBreak: "break-all" }}>
                    {a.vars.join(" · ")}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {probes && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {probes.map((p) => (
            <div
              key={p.name}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 10,
                border: "1px solid #e4e4e7",
                borderRadius: 10,
                padding: "10px 12px",
                background: p.ok ? "#f0fdf4" : p.skipped ? "#fafafa" : "#fef2f2",
              }}
            >
              <span style={{ fontSize: 13, flexShrink: 0 }}>
                {p.ok ? "✅" : p.skipped ? "—" : "❌"}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#18181b" }}>{p.name}</div>
                <div style={{ fontSize: 12, color: "#52525b", lineHeight: 1.5, wordBreak: "break-word" }}>
                  {p.detail}
                </div>
              </div>
              {p.ms > 0 && (
                <span style={{ fontSize: 11, color: "#a1a1aa", flexShrink: 0 }}>{p.ms}ms</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
