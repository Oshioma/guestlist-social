import { requireAdmin } from "@/lib/auth/permissions";
import { inspectEnv, type VarStatus } from "@/lib/system-checks";
import { isDryRun } from "@/lib/meta-execute";
import SystemProbes from "./SystemProbes";

export const dynamic = "force-dynamic";

const STATUS_STYLE: Record<VarStatus, { label: string; bg: string; fg: string; border: string }> = {
  ok: { label: "OK", bg: "#f0fdf4", fg: "#166534", border: "#bbf7d0" },
  warn: { label: "Not set", bg: "#fafafa", fg: "#52525b", border: "#e4e4e7" },
  malformed: { label: "Looks wrong", bg: "#fffbeb", fg: "#92400e", border: "#fde68a" },
  missing: { label: "Missing", bg: "#fef2f2", fg: "#991b1b", border: "#fecaca" },
};

export default async function SystemsPage() {
  await requireAdmin();

  const groups = inspectEnv();
  const all = groups.flatMap((g) => g.vars);
  const broken = all.filter((v) => v.status === "missing" || v.status === "malformed");
  const dryRun = isDryRun();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 900 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#18181b" }}>Systems</h1>
        <p style={{ margin: "6px 0 0", fontSize: 13, color: "#71717a", lineHeight: 1.55 }}>
          Every environment variable and third-party service this app depends
          on. Values are never shown — only whether one is set, whether it
          looks right, its length, and an 8-character fingerprint so you can
          tell whether an edit actually reached this deployment.
        </p>
      </div>

      <div
        style={{
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          alignItems: "center",
          background: broken.length ? "#fffbeb" : "#f0fdf4",
          border: `1px solid ${broken.length ? "#fde68a" : "#bbf7d0"}`,
          borderRadius: 12,
          padding: "12px 14px",
          fontSize: 13,
          color: broken.length ? "#92400e" : "#166534",
        }}
      >
        <strong style={{ fontWeight: 700 }}>
          {broken.length === 0
            ? "Everything required is set and well-formed."
            : `${broken.length} setting${broken.length === 1 ? "" : "s"} need attention:`}
        </strong>
        {broken.length > 0 && (
          <span style={{ color: "#78350f" }}>{broken.map((v) => v.name).join(", ")}</span>
        )}
      </div>

      <div
        style={{
          background: dryRun ? "#fafafa" : "#fef2f2",
          border: `1px solid ${dryRun ? "#e4e4e7" : "#fecaca"}`,
          borderRadius: 12,
          padding: "12px 14px",
          fontSize: 13,
          lineHeight: 1.55,
          color: dryRun ? "#52525b" : "#991b1b",
        }}
      >
        <strong style={{ fontWeight: 700 }}>
          {dryRun ? "Meta writes are simulated." : "Meta writes are live and can spend money."}
        </strong>{" "}
        {dryRun
          ? "META_EXECUTE_DRY_RUN is not \"false\", so the delivery switch and the other Meta write actions log what they would do and send nothing."
          : "META_EXECUTE_DRY_RUN is \"false\", so switching a campaign on charges real money at its daily budget."}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#18181b" }}>
          Live checks
        </h2>
        <SystemProbes />
      </div>

      {groups.map((group) => (
        <div key={group.group} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#18181b" }}>
              {group.group}
            </h2>
            <p style={{ margin: "2px 0 0", fontSize: 12, color: "#a1a1aa" }}>{group.blurb}</p>
          </div>

          <div
            style={{
              border: "1px solid #e4e4e7",
              borderRadius: 12,
              overflow: "hidden",
              background: "#fff",
            }}
          >
            {group.vars.map((v, i) => {
              const style = STATUS_STYLE[v.status];
              return (
                <div
                  key={v.name}
                  style={{
                    display: "flex",
                    gap: 12,
                    padding: "12px 14px",
                    borderTop: i === 0 ? "none" : "1px solid #f4f4f5",
                    alignItems: "flex-start",
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 240 }}>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 700,
                        color: "#18181b",
                        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                      }}
                    >
                      {v.name}
                      {v.required && (
                        <span style={{ color: "#b91c1c", fontWeight: 400 }} title="Required">
                          {" "}
                          *
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: "#71717a", lineHeight: 1.5, marginTop: 2 }}>
                      {v.purpose}
                    </div>
                    {v.note && (
                      <div style={{ fontSize: 12, color: style.fg, lineHeight: 1.5, marginTop: 4 }}>
                        {v.note}
                      </div>
                    )}
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                    {v.fingerprint && (
                      <span
                        style={{
                          fontSize: 11,
                          color: "#a1a1aa",
                          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                        }}
                        title="First 8 characters of a SHA-256 of the value — a changed value shows a changed fingerprint"
                      >
                        {v.length} chars · {v.fingerprint}
                      </span>
                    )}
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        padding: "3px 10px",
                        borderRadius: 999,
                        background: style.bg,
                        color: style.fg,
                        border: `1px solid ${style.border}`,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {style.label}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      <p style={{ fontSize: 12, color: "#a1a1aa", lineHeight: 1.6 }}>
        Set these in Vercel → Project → Settings → Environment Variables, then
        redeploy: environment changes only take effect on a new deployment. If a
        fingerprint here is unchanged after an edit, this deployment is still
        serving the old value.
      </p>
    </div>
  );
}
