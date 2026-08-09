"use client";

import { useState, useActionState } from "react";
import { setTeamPlan, type ActionState } from "@/lib/auth/team-actions";
import {
  PLAN_ORDER,
  PLANS,
  TRIAL_DAYS,
  isPaidPlan,
  planConfig,
  type Plan,
} from "@/lib/billing/plans";
import { secondaryButtonStyle, errorBoxStyle, successBoxStyle } from "../form-styles";

export type BillingInfo = {
  plan: Plan;
  used: number;
  subscriptionStatus: string | null;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  hasCustomer: boolean;
  canManageBilling: boolean; // owner or staff
  isStaff: boolean;
  stripeConfigured: boolean;
};

function fmtDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function BillingPanel({ teamId, info }: { teamId: string; info: BillingInfo }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function go(kind: "checkout" | "portal", plan?: Plan) {
    setBusy(plan ?? kind);
    setError(null);
    try {
      const res = await fetch(`/api/stripe/${kind}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(plan ? { teamId, plan } : { teamId }),
      });
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        setError(data.error ?? "Something went wrong. Please try again.");
        setBusy(null);
        return;
      }
      window.location.href = data.url;
    } catch {
      setError("Network error. Please try again.");
      setBusy(null);
    }
  }

  const current = planConfig(info.plan);
  const status = info.subscriptionStatus;
  const trialEnd = fmtDate(info.trialEndsAt);
  const periodEnd = fmtDate(info.currentPeriodEnd);
  const onTrial = status === "trialing";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Current status line */}
      <div style={{ fontSize: 13, color: "#3f3f46" }}>
        On the <strong>{current.name}</strong> plan · {info.used}/{current.socialAccounts} social
        accounts used
        {onTrial && trialEnd && (
          <span style={{ color: "#2f7d5b" }}> · trial ends {trialEnd}</span>
        )}
        {!onTrial && status === "active" && periodEnd && (
          <span style={{ color: "#71717a" }}> · renews {periodEnd}</span>
        )}
        {status === "past_due" && (
          <span style={{ color: "#b45309" }}> · payment past due — update your card</span>
        )}
      </div>

      {error && <div style={errorBoxStyle}>{error}</div>}

      {!info.stripeConfigured && (
        <div style={{ ...successBoxStyle, background: "#fff7ed", color: "#9a3412", borderColor: "#fed7aa" }}>
          Billing isn&rsquo;t configured on this deployment yet.
        </div>
      )}

      {/* Plan cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
        {PLAN_ORDER.map((p) => {
          const cfg = PLANS[p];
          const isCurrent = p === info.plan;
          return (
            <div
              key={p}
              style={{
                border: `1px solid ${isCurrent ? "#18181b" : "#e4e4e7"}`,
                borderRadius: 12,
                padding: 16,
                background: isCurrent ? "#fafafa" : "#fff",
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              <div>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ fontSize: 15, fontWeight: 700 }}>{cfg.name}</span>
                  {isCurrent && (
                    <span style={{ fontSize: 10, fontWeight: 700, color: "#2f7d5b", textTransform: "uppercase", letterSpacing: 0.4 }}>
                      Current
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 20, fontWeight: 700, marginTop: 2 }}>{cfg.priceLabel}</div>
              </div>
              <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 4 }}>
                {cfg.features.map((f) => (
                  <li key={f} style={{ fontSize: 12, color: "#52525b", display: "flex", gap: 6 }}>
                    <span style={{ color: "#2f7d5b" }}>✓</span>
                    {f}
                  </li>
                ))}
              </ul>

              {info.canManageBilling && !isCurrent && isPaidPlan(p) && (
                <button
                  type="button"
                  disabled={!info.stripeConfigured || busy !== null}
                  onClick={() => go("checkout", p)}
                  style={{
                    ...secondaryButtonStyle(busy !== null),
                    background: "#18181b",
                    color: "#fff",
                    borderColor: "#18181b",
                    marginTop: "auto",
                  }}
                >
                  {busy === p
                    ? "Redirecting…"
                    : info.plan === "free"
                    ? `Start ${TRIAL_DAYS}-day trial`
                    : `Switch to ${cfg.name}`}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {info.canManageBilling && info.hasCustomer && (
        <div>
          <button
            type="button"
            disabled={!info.stripeConfigured || busy !== null}
            onClick={() => go("portal")}
            style={secondaryButtonStyle(busy !== null)}
          >
            {busy === "portal" ? "Opening…" : "Manage billing"}
          </button>
          <p style={{ fontSize: 12, color: "#a1a1aa", margin: "6px 0 0" }}>
            Change plan, update your card, or cancel in the Stripe billing portal.
          </p>
        </div>
      )}

      {!info.canManageBilling && (
        <p style={{ fontSize: 12, color: "#a1a1aa", margin: 0 }}>
          Only the team owner can change the plan or manage billing.
        </p>
      )}

      {info.isStaff && <StaffOverride teamId={teamId} plan={info.plan} />}
    </div>
  );
}

// Agency-staff-only manual plan override — comp an account or fix a plan without
// a live Stripe subscription. Hidden from ordinary owners.
function StaffOverride({ teamId, plan }: { teamId: string; plan: Plan }) {
  const [state, action, pending] = useActionState<ActionState | null, FormData>(setTeamPlan, null);
  return (
    <details style={{ borderTop: "1px solid #f4f4f5", paddingTop: 12 }}>
      <summary style={{ fontSize: 12, color: "#71717a", cursor: "pointer", fontWeight: 600 }}>
        Staff: manual plan override
      </summary>
      <form action={action} style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10, flexWrap: "wrap" }}>
        {state?.error && <div style={errorBoxStyle}>{state.error}</div>}
        {state?.success && state.message && <div style={successBoxStyle}>{state.message}</div>}
        <input type="hidden" name="teamId" value={teamId} />
        <select name="plan" defaultValue={plan} style={{ padding: "6px 8px", borderRadius: 8, border: "1px solid #e4e4e7", fontSize: 13 }}>
          {PLAN_ORDER.map((p) => (
            <option key={p} value={p}>
              {PLANS[p].name}
            </option>
          ))}
        </select>
        <button type="submit" disabled={pending} style={secondaryButtonStyle(pending)}>
          {pending ? "Saving…" : "Set plan"}
        </button>
      </form>
    </details>
  );
}
