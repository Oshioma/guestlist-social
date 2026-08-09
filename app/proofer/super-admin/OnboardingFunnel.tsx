import type { OnboardingFunnel as Funnel } from "@/lib/admin/onboarding-funnel";

// A compact funnel: one bar per milestone, width proportional to the number of
// users who reached it, with the step-to-step retention shown alongside so
// drop-off is obvious at a glance.
export default function OnboardingFunnel({ data }: { data: Funnel }) {
  const max = Math.max(data.started, 1);

  if (data.started === 0) {
    return (
      <p style={{ fontSize: 13, color: "#a1a1aa", margin: 0 }}>
        No onboarding activity yet.
      </p>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 14 }}>
        <Stat label="Started" value={data.started} />
        <Stat label="Finished" value={data.completed} accent="#16a34a" />
        <Stat
          label="Completion"
          value={`${Math.round((data.completed / data.started) * 100)}%`}
          accent="#16a34a"
        />
        <Stat label="Skipped" value={data.skipped} accent="#a16207" />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {data.steps.map((s) => {
          const pct = Math.round((s.users / max) * 100);
          const dropped = s.keptPct != null && s.keptPct < 100;
          return (
            <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ width: 190, fontSize: 12.5, color: "#3f3f46", flexShrink: 0 }}>
                {s.label}
              </span>
              <div style={{ flex: 1, minWidth: 0, height: 22, background: "#f1f1f4", borderRadius: 6, overflow: "hidden" }}>
                <div
                  style={{
                    width: `${pct}%`,
                    height: "100%",
                    background: "linear-gradient(90deg,#7c3aed,#a78bfa)",
                    borderRadius: 6,
                    transition: "width 200ms ease",
                  }}
                />
              </div>
              <span style={{ width: 48, textAlign: "right", fontSize: 13, fontWeight: 700, color: "#18181b", flexShrink: 0 }}>
                {s.users}
              </span>
              <span
                style={{
                  width: 64,
                  textAlign: "right",
                  fontSize: 12,
                  fontWeight: 600,
                  color: dropped ? "#b91c1c" : "#a1a1aa",
                  flexShrink: 0,
                }}
                title="Kept from the previous step"
              >
                {s.keptPct == null ? "" : `${s.keptPct}%`}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number | string; accent?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <span style={{ fontSize: 20, fontWeight: 800, color: accent ?? "#18181b" }}>{value}</span>
      <span style={{ fontSize: 11, color: "#a1a1aa", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4 }}>
        {label}
      </span>
    </div>
  );
}
