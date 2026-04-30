// ---------------------------------------------------------------------------
// /portal/[clientId] — client dashboard.
//
// This is the room a client walks into. Three things, in order:
//   1. A short status sentence — "We're testing 4 ads, 2 are winning."
//   2. Top priorities for *this* client — what's pending, why it matters,
//      everything read-only.
//   3. Latest sent review (if any) — one-tap into the narrative.
//
// We deliberately keep counts and dollar amounts soft. The portal is for trust,
// not operating, so the visual hierarchy is "narrative first, numbers second".
// ---------------------------------------------------------------------------

import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { canViewClient, getViewer } from "../../admin-panel/lib/viewer";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

type Ad = {
  id: number;
  name: string;
  status: string | null;
  meta_status: string | null;
  spend: number | null;
  impressions: number | null;
  clicks: number | null;
  conversions: number | null;
};

type Action = {
  id: string;
  ad_id: number | null;
  problem: string | null;
  action: string | null;
  priority: string | null;
  created_at: string;
};

type Decision = {
  id: number;
  ad_id: number | null;
  type: string | null;
  reason: string | null;
  action: string | null;
  confidence: string | null;
  created_at: string;
};

// "What we changed since last review" — one row per executed action / decision.
// Bundles together completed ad_actions (the operator-driven side) and
// executed ad_decisions (the engine-driven side) into a single visual list.
type Movement = {
  key: string;
  kind: "action" | "decision";
  at: string;
  label: string;
  detail: string | null;
  operatorNote: string | null;
  outcome: "positive" | "neutral" | "negative" | null;
  adId: number | null;
  adName: string | null;
};

const OUTCOME_BADGE: Record<
  NonNullable<Movement["outcome"]>,
  { bg: string; fg: string; symbol: string; label: string }
> = {
  positive: { bg: "#dcfce7", fg: "#166534", symbol: "▲", label: "Positive" },
  neutral: { bg: "#f1f5f9", fg: "#475569", symbol: "·", label: "Neutral" },
  negative: { bg: "#fee2e2", fg: "#991b1b", symbol: "▼", label: "Negative" },
};

const PRIORITY_RANK: Record<string, number> = { high: 3, medium: 2, low: 1 };

export default async function PortalClientDashboard({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId: rawClientId } = await params;
  const clientId = Number(rawClientId);

  const viewer = await getViewer();
  if (!canViewClient(viewer, clientId)) notFound();

  const supabase = await createClient();

  // Fetch ads first — we need their ids to scope ad_actions (ad_actions has
  // no client_id column, so the only way to scope is via ad_id IN (...)).
  const adsRes = await supabase
    .from("ads")
    .select("id, name, status, meta_status, spend, impressions, clicks, conversions")
    .eq("client_id", clientId);
  const ads = (adsRes.data ?? []) as Ad[];
  const adIds = ads.map((a) => a.id);

  // Find the most recent approved review *first* — its approved_at is the
  // cutoff for the "what changed since" panel below. We do this in parallel
  // with the pending lists so it's free latency-wise.
  const [actionsRes, decisionsRes, reviewsRes, lastApprovedRes] =
    await Promise.all([
      adIds.length === 0
        ? Promise.resolve({ data: [] as Action[] })
        : supabase
            .from("ad_actions")
            .select("id, ad_id, problem, action, priority, created_at")
            .eq("status", "pending")
            .in("ad_id", adIds)
            .order("created_at", { ascending: false }),
      supabase
        .from("ad_decisions")
        .select("id, ad_id, type, reason, action, confidence, created_at")
        .eq("client_id", clientId)
        .eq("status", "pending")
        .order("created_at", { ascending: false }),
      supabase
        .from("reviews")
        .select("id, period_label, headline, status, sent_at, approved_at")
        .eq("client_id", clientId)
        .in("status", ["sent", "approved"])
        .order("period_end", { ascending: false })
        .limit(1),
      supabase
        .from("reviews")
        .select("id, period_label, approved_at")
        .eq("client_id", clientId)
        .eq("status", "approved")
        .not("approved_at", "is", null)
        .order("approved_at", { ascending: false })
        .limit(1),
    ]);

  const actions = (actionsRes.data ?? []) as Action[];
  const decisions = (decisionsRes.data ?? []) as Decision[];
  const latestReview = ((reviewsRes.data ?? [])[0] ?? null) as
    | {
        id: number;
        period_label: string;
        headline: string | null;
        status: string;
        sent_at: string | null;
        approved_at: string | null;
      }
    | null;
  const lastApproved = ((lastApprovedRes.data ?? [])[0] ?? null) as
    | { id: number; period_label: string; approved_at: string }
    | null;

  const consultationFormsRes = await supabase
    .from("consultation_forms")
    .select("id")
    .eq("client_id", clientId)
    .eq("is_active", true)
    .limit(1);
  const consultationFormsMissing = consultationFormsRes.error?.code === "42P01";
  const hasActiveConsultationForm = consultationFormsMissing
    ? false
    : (consultationFormsRes.data?.length ?? 0) > 0;

  // ── "What we changed since last review" panel ──────────────────────────
  // Only renders for clients who have at least one signed-off review — the
  // whole point of the panel is to show a *returning* client what moved
  // since they last looked. New clients see nothing here, by design.
  let movements: Movement[] = [];
  if (lastApproved && adIds.length > 0) {
    const cutoff = lastApproved.approved_at;
    const adNameById = new Map(ads.map((a) => [a.id, a.name] as const));

    const [completedActionsRes, executedDecisionsRes] = await Promise.all([
      supabase
        .from("ad_actions")
        .select(
          "id, ad_id, problem, action, completed_at, outcome, result_summary, operator_note"
        )
        .in("ad_id", adIds)
        .eq("status", "completed")
        .gt("completed_at", cutoff)
        .order("completed_at", { ascending: false }),
      supabase
        .from("ad_decisions")
        .select("id, ad_id, type, reason, action, executed_at, execution_result")
        .eq("client_id", clientId)
        .not("executed_at", "is", null)
        .gt("executed_at", cutoff)
        .order("executed_at", { ascending: false }),
    ]);

    for (const a of (completedActionsRes.data ?? []) as Array<{
      id: string;
      ad_id: number | null;
      problem: string | null;
      action: string | null;
      completed_at: string;
      outcome: string | null;
      result_summary: string | null;
      operator_note: string | null;
    }>) {
      const outcome = (() => {
        if (a.outcome === "positive" || a.outcome === "negative" || a.outcome === "neutral") {
          return a.outcome;
        }
        return null;
      })();
      movements.push({
        key: `action-${a.id}`,
        kind: "action",
        at: a.completed_at,
        label: a.action ?? a.problem ?? "Action completed",
        detail: a.result_summary,
        operatorNote: a.operator_note,
        outcome,
        adId: a.ad_id,
        adName: a.ad_id ? adNameById.get(a.ad_id) ?? null : null,
      });
    }

    for (const d of (executedDecisionsRes.data ?? []) as Array<{
      id: number;
      ad_id: number | null;
      type: string | null;
      reason: string | null;
      action: string | null;
      executed_at: string;
      execution_result: string | null;
    }>) {
      movements.push({
        key: `decision-${d.id}`,
        kind: "decision",
        at: d.executed_at,
        label: d.action ?? d.reason ?? `Decision · ${d.type ?? "executed"}`,
        detail: d.execution_result ?? d.reason,
        operatorNote: null,
        outcome: null,
        adId: d.ad_id,
        adName: d.ad_id ? adNameById.get(d.ad_id) ?? null : null,
      });
    }

    movements.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  }

  // ── Soft "what's happening" line ────────────────────────────────────────
  const activeAds = ads.filter(
    (a) => (a.status ?? "").toLowerCase() === "active"
  );
  const totalSpend = ads.reduce((s, a) => s + Number(a.spend ?? 0), 0);
  const totalConversions = ads.reduce(
    (s, a) => s + Number(a.conversions ?? 0),
    0
  );

  // Score the top three pending items the same way the admin dashboard does:
  // priority dominates, newest breaks ties.
  type Priority = {
    kind: "action" | "decision";
    rank: number;
    label: string;
    why: string | null;
    detail: string | null;
    adId: number | null;
    confidenceOrPriority: string;
    createdAt: string;
  };
  const priorities: Priority[] = [];
  for (const a of actions) {
    priorities.push({
      kind: "action",
      rank: PRIORITY_RANK[a.priority ?? "low"] ?? 1,
      label: a.problem ?? a.action ?? "Action proposed",
      why: a.problem ?? null,
      detail: a.action ?? null,
      adId: a.ad_id,
      confidenceOrPriority: a.priority ?? "low",
      createdAt: a.created_at,
    });
  }
  for (const d of decisions) {
    const conf = (d.confidence ?? "medium").toLowerCase();
    const rank = conf === "high" ? 3 : conf === "low" ? 1 : 2;
    priorities.push({
      kind: "decision",
      rank,
      label: d.reason ?? d.action ?? "Decision proposed",
      why: d.reason ?? null,
      detail: d.action ?? null,
      adId: d.ad_id,
      confidenceOrPriority: conf,
      createdAt: d.created_at,
    });
  }
  priorities.sort((a, b) => {
    if (b.rank !== a.rank) return b.rank - a.rank;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
  const top = priorities.slice(0, 3);
  const remaining = priorities.length - top.length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      {/* ── Hero status line ───────────────────────────────────────────── */}
      <div>
        <div
          style={{
            fontSize: 12,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            color: "#64748b",
          }}
        >
          Today
        </div>
        <h1
          style={{
            margin: "6px 0 0",
            fontSize: 28,
            fontWeight: 700,
            color: "#0f172a",
            lineHeight: 1.25,
          }}
        >
          {activeAds.length === 0
            ? "No ads are running right now."
            : `${activeAds.length} ad${activeAds.length === 1 ? "" : "s"} running, ${totalConversions} conversion${totalConversions === 1 ? "" : "s"} this period.`}
        </h1>
        <p
          style={{
            margin: "8px 0 0",
            fontSize: 14,
            color: "#475569",
            lineHeight: 1.6,
            maxWidth: 680,
          }}
        >
          This is your read-only view. Everything you see here is the same data
          your operator works from — just without the editing controls. Open
          any ad to see the full audit trail of what we&rsquo;ve done and why.
        </p>
      </div>

      {/* ── Soft stat row ──────────────────────────────────────────────── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: 12,
        }}
      >
        {[
          { label: "Active ads", value: String(activeAds.length) },
          { label: "Total ads", value: String(ads.length) },
          {
            label: "Spend",
            value: `$${totalSpend.toFixed(0)}`,
          },
          { label: "Conversions", value: String(totalConversions) },
        ].map((stat) => (
          <div
            key={stat.label}
            style={{
              padding: "16px 18px",
              background: "#fff",
              border: "1px solid #e2e8f0",
              borderRadius: 12,
            }}
          >
            <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.04em" }}>
              {stat.label}
            </div>
            <div style={{ marginTop: 6, fontSize: 22, fontWeight: 700, color: "#0f172a" }}>
              {stat.value}
            </div>
          </div>
        ))}
      </div>

      {/* ── Consultation shortcut ──────────────────────────────────────── */}
      <section
        style={{
          background: "#fff",
          border: "1px solid #e2e8f0",
          borderRadius: 16,
          padding: 20,
        }}
      >
        <h2
          style={{
            margin: 0,
            fontSize: 16,
            fontWeight: 700,
            color: "#0f172a",
          }}
        >
          Consultation questionnaire
        </h2>
        <p
          style={{
            margin: "8px 0 0",
            fontSize: 13,
            color: "#475569",
            lineHeight: 1.6,
            maxWidth: 760,
          }}
        >
          Share your latest priorities, offers, and messaging. Your team uses this
          form to shape campaigns, copy, and publishing focus.
        </p>
        <div
          style={{
            marginTop: 12,
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <span
            style={{
              padding: "3px 10px",
              borderRadius: 999,
              fontSize: 11,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              background: hasActiveConsultationForm ? "#dcfce7" : "#fef9c3",
              color: hasActiveConsultationForm ? "#166534" : "#854d0e",
            }}
          >
            {hasActiveConsultationForm ? "Ready to complete" : "Preparing form"}
          </span>
          <Link
            href={`/portal/${clientId}/consultation`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              border: "1px solid #cbd5e1",
              borderRadius: 8,
              padding: "8px 12px",
              fontSize: 13,
              fontWeight: 600,
              color: "#1e40af",
              textDecoration: "none",
              background: "#f8fafc",
            }}
          >
            Open consultation form →
          </Link>
        </div>
      </section>

      {/* ── Top priorities ─────────────────────────────────────────────── */}
      <section
        style={{
          background: "#fff",
          border: "1px solid #e2e8f0",
          borderRadius: 16,
          padding: 24,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            marginBottom: 4,
          }}
        >
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: "#0f172a" }}>
            Top priorities
          </h2>
          <span style={{ fontSize: 12, color: "#94a3b8" }}>
            {priorities.length} pending
          </span>
        </div>
        <p style={{ margin: "4px 0 16px", fontSize: 12, color: "#64748b" }}>
          The three things on your operator&rsquo;s desk right now, ranked by
          priority. These are read-only — nothing here moves until your
          operator makes a call.
        </p>

        {top.length === 0 ? (
          <div
            style={{
              padding: 24,
              textAlign: "center",
              color: "#94a3b8",
              fontSize: 13,
            }}
          >
            Nothing pending. The room is calm.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {top.map((p, i) => (
              <div
                key={`${p.kind}-${i}`}
                style={{
                  display: "flex",
                  gap: 14,
                  padding: 16,
                  background: "#f8fafc",
                  borderRadius: 12,
                  border: "1px solid #e2e8f0",
                }}
              >
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: "50%",
                    background: "#0f172a",
                    color: "#fff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 13,
                    fontWeight: 700,
                    flexShrink: 0,
                  }}
                >
                  {i + 1}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: "#0f172a",
                    }}
                  >
                    {p.label}
                  </div>
                  {p.detail && p.detail !== p.label && (
                    <div
                      style={{
                        marginTop: 4,
                        fontSize: 13,
                        color: "#475569",
                        lineHeight: 1.5,
                      }}
                    >
                      {p.detail}
                    </div>
                  )}
                  <div
                    style={{
                      marginTop: 8,
                      display: "flex",
                      gap: 8,
                      alignItems: "center",
                      flexWrap: "wrap",
                    }}
                  >
                    <span
                      style={{
                        padding: "2px 8px",
                        borderRadius: 999,
                        fontSize: 10,
                        fontWeight: 700,
                        background: p.kind === "action" ? "#fef3c7" : "#dbeafe",
                        color: p.kind === "action" ? "#92400e" : "#1e40af",
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                      }}
                    >
                      {p.kind}
                    </span>
                    <span
                      style={{
                        fontSize: 11,
                        color: "#94a3b8",
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                      }}
                    >
                      {p.confidenceOrPriority}
                    </span>
                    {p.adId && (
                      <Link
                        href={`/portal/${clientId}/ads/${p.adId}`}
                        style={{
                          fontSize: 12,
                          color: "#1e40af",
                          textDecoration: "none",
                          fontWeight: 600,
                        }}
                      >
                        Open audit trail →
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {remaining > 0 && (
              <div style={{ fontSize: 12, color: "#94a3b8", paddingLeft: 4 }}>
                + {remaining} more pending {remaining === 1 ? "item is" : "items are"} hidden.
              </div>
            )}
          </div>
        )}
      </section>

      {/* ── What we changed since last review ─────────────────────────── */}
      {lastApproved && (
        <section
          style={{
            background: "#fff",
            border: "1px solid #e2e8f0",
            borderRadius: 16,
            padding: 24,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              marginBottom: 4,
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <h2
              style={{
                fontSize: 16,
                fontWeight: 700,
                margin: 0,
                color: "#0f172a",
              }}
            >
              What we&rsquo;ve done since {lastApproved.period_label}
            </h2>
            <span style={{ fontSize: 12, color: "#94a3b8" }}>
              {movements.length}{" "}
              {movements.length === 1 ? "change" : "changes"}
            </span>
          </div>
          <p
            style={{
              margin: "4px 0 16px",
              fontSize: 12,
              color: "#64748b",
            }}
          >
            Everything your operator has shipped since you signed off your
            last review. The next review will fold these in.
          </p>

          {movements.length === 0 ? (
            <div
              style={{
                padding: 24,
                textAlign: "center",
                color: "#94a3b8",
                fontSize: 13,
              }}
            >
              Nothing new yet. Your next review will pick up from here.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {movements.map((m) => {
                const badge = m.outcome ? OUTCOME_BADGE[m.outcome] : null;
                return (
                  <div
                    key={m.key}
                    style={{
                      display: "flex",
                      gap: 12,
                      padding: 14,
                      background: "#f8fafc",
                      borderRadius: 12,
                      border: "1px solid #e2e8f0",
                    }}
                  >
                    {/* Outcome / kind dot */}
                    <div
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: "50%",
                        flexShrink: 0,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        background: badge?.bg ?? "#e0f2fe",
                        color: badge?.fg ?? "#0c4a6e",
                        fontSize: 13,
                        fontWeight: 700,
                      }}
                      title={badge?.label ?? "Decision executed"}
                    >
                      {badge?.symbol ?? "→"}
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 14,
                          fontWeight: 600,
                          color: "#0f172a",
                          lineHeight: 1.4,
                        }}
                      >
                        {m.label}
                      </div>
                      {m.detail && m.detail !== m.label && (
                        <div
                          style={{
                            marginTop: 4,
                            fontSize: 13,
                            color: "#475569",
                            lineHeight: 1.5,
                          }}
                        >
                          {m.detail}
                        </div>
                      )}
                      {m.operatorNote && (
                        <div
                          style={{
                            marginTop: 8,
                            padding: "8px 12px",
                            background: "#f0f9ff",
                            border: "1px solid #bae6fd",
                            borderRadius: 8,
                            fontSize: 12,
                            color: "#0c4a6e",
                            lineHeight: 1.5,
                          }}
                        >
                          <strong style={{ fontWeight: 600 }}>
                            Note from your team:
                          </strong>{" "}
                          {m.operatorNote}
                        </div>
                      )}
                      <div
                        style={{
                          marginTop: 8,
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          flexWrap: "wrap",
                        }}
                      >
                        <span
                          style={{
                            padding: "2px 8px",
                            borderRadius: 999,
                            fontSize: 10,
                            fontWeight: 700,
                            background:
                              m.kind === "action" ? "#fef3c7" : "#dbeafe",
                            color:
                              m.kind === "action" ? "#92400e" : "#1e40af",
                            textTransform: "uppercase",
                            letterSpacing: "0.04em",
                          }}
                        >
                          {m.kind}
                        </span>
                        <span
                          style={{
                            fontSize: 11,
                            color: "#94a3b8",
                          }}
                        >
                          {new Date(m.at).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                          })}
                        </span>
                        {m.adId && m.adName && (
                          <Link
                            href={`/portal/${clientId}/ads/${m.adId}`}
                            style={{
                              fontSize: 12,
                              color: "#1e40af",
                              textDecoration: "none",
                              fontWeight: 600,
                            }}
                          >
                            {m.adName} →
                          </Link>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* ── Latest review ──────────────────────────────────────────────── */}
      {latestReview && (
        <section
          style={{
            background: "linear-gradient(135deg,#0f172a,#1e293b)",
            color: "#fff",
            borderRadius: 16,
            padding: 28,
          }}
        >
          <div
            style={{
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "#94a3b8",
            }}
          >
            Latest review · {latestReview.period_label}
          </div>
          <h2
            style={{
              margin: "8px 0 0",
              fontSize: 22,
              fontWeight: 700,
              lineHeight: 1.25,
            }}
          >
            {latestReview.headline ?? "Review available"}
          </h2>
          <Link
            href={`/portal/${clientId}/reviews/${latestReview.id}`}
            style={{
              display: "inline-block",
              marginTop: 16,
              padding: "10px 18px",
              background: "#fff",
              color: "#0f172a",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            Read the full review →
          </Link>
        </section>
      )}
    </div>
  );
}
