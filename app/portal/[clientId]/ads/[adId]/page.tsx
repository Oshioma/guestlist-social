// ---------------------------------------------------------------------------
// /portal/[clientId]/ads/[adId] — read-only audit trail.
//
// Fork of the admin per-ad audit trail (app/admin-panel/clients/[clientId]/
// ads/[adId]/page.tsx). Same fold-five-tables-into-one-timeline logic, same
// chronological "what happened, why, was it right" framing — but with two
// differences appropriate for the client surface:
//
//   1. No source links. The admin version links each event back to the
//      action/decision queue rows. The portal has no queue, so we drop the
//      "Open in queue" affordance entirely.
//   2. Calmer palette. We swap the categorical colour ramp for a softer
//      slate/blue/sage one and skip confidence pills (clients shouldn't have
//      to read "high/medium/low" tags to trust the work).
// ---------------------------------------------------------------------------

import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { canViewClient, getViewer } from "../../../../admin-panel/lib/viewer";

export const dynamic = "force-dynamic";

type EventKind =
  | "ad_created"
  | "action_proposed"
  | "action_completed"
  | "decision_proposed"
  | "decision_approved"
  | "decision_rejected"
  | "decision_executed"
  | "learning_recorded"
  | "experiment_joined";

type MetricSnapshot = {
  ctr?: number | null;
  cpc?: number | null;
  spend?: number | null;
  impressions?: number | null;
  clicks?: number | null;
  conversions?: number | null;
} | null;

type TimelineEvent = {
  id: string;
  at: string;
  kind: EventKind;
  title: string;
  why?: string | null;
  detail?: string | null;
  // Operator's typed gloss when completing the action — surfaces calmly
  // in the trail so clients see human context next to the metric delta.
  operatorNote?: string | null;
  before?: MetricSnapshot;
  after?: MetricSnapshot;
  outcome?: "positive" | "neutral" | "negative" | null;
};

const KIND_DOT: Record<EventKind, string> = {
  ad_created: "#94a3b8",
  action_proposed: "#0284c7",
  action_completed: "#15803d",
  decision_proposed: "#1e40af",
  decision_approved: "#1e40af",
  decision_rejected: "#64748b",
  decision_executed: "#0f766e",
  learning_recorded: "#7c3aed",
  experiment_joined: "#be185d",
};

const KIND_LABEL: Record<EventKind, string> = {
  ad_created: "Ad created",
  action_proposed: "Action proposed",
  action_completed: "Action completed",
  decision_proposed: "Decision proposed",
  decision_approved: "Decision approved",
  decision_rejected: "Decision declined",
  decision_executed: "Decision executed",
  learning_recorded: "Learning recorded",
  experiment_joined: "Joined experiment",
};

const OUTCOME_PALETTE: Record<
  "positive" | "neutral" | "negative",
  { bg: string; fg: string }
> = {
  positive: { bg: "#dcfce7", fg: "#166534" },
  neutral: { bg: "#f1f5f9", fg: "#475569" },
  negative: { bg: "#fee2e2", fg: "#991b1b" },
};

function relativeDate(iso: string): string {
  const then = new Date(iso);
  const now = new Date();
  const days = Math.floor((now.getTime() - then.getTime()) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  const sameYear = then.getFullYear() === now.getFullYear();
  return then.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

function exactTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function num(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === "string" ? parseFloat(v) : (v as number);
  return Number.isFinite(n) ? n : null;
}

function snap(raw: any): MetricSnapshot {
  if (!raw || typeof raw !== "object") return null;
  return {
    ctr: num(raw.ctr ?? raw.CTR),
    cpc: num(raw.cpc ?? raw.CPC),
    spend: num(raw.spend),
    impressions: num(raw.impressions),
    clicks: num(raw.clicks),
    conversions: num(raw.conversions),
  };
}

function MetricDelta({
  before,
  after,
}: {
  before: MetricSnapshot;
  after: MetricSnapshot;
}) {
  if (!before && !after) return null;
  const fields: { key: keyof NonNullable<MetricSnapshot>; label: string }[] = [
    { key: "ctr", label: "CTR" },
    { key: "cpc", label: "CPC" },
    { key: "spend", label: "Spend" },
    { key: "conversions", label: "Conv" },
  ];
  const cells = fields
    .map(({ key, label }) => {
      const b = before?.[key];
      const a = after?.[key];
      if (b == null && a == null) return null;
      if (b == null || a == null || b === a) {
        return { label, before: b, after: a, deltaPct: null as number | null };
      }
      const deltaPct = b !== 0 ? ((a - b) / Math.abs(b)) * 100 : null;
      return { label, before: b, after: a, deltaPct };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
  if (cells.length === 0) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
      {cells.map((c) => {
        const positive = c.deltaPct != null && c.deltaPct > 0;
        const negative = c.deltaPct != null && c.deltaPct < 0;
        return (
          <span
            key={c.label}
            style={{
              padding: "4px 10px",
              borderRadius: 8,
              background: "#f8fafc",
              border: "1px solid #e2e8f0",
              fontSize: 11,
              color: "#475569",
              display: "inline-flex",
              gap: 6,
              alignItems: "center",
            }}
          >
            <span style={{ fontWeight: 600, color: "#64748b" }}>{c.label}</span>
            <span style={{ color: "#94a3b8" }}>
              {c.before != null ? c.before.toFixed(c.label === "CTR" ? 2 : 0) : "—"}
              {c.label === "CTR" ? "%" : ""}
            </span>
            <span style={{ color: "#cbd5e1" }}>→</span>
            <span style={{ color: "#0f172a", fontWeight: 600 }}>
              {c.after != null ? c.after.toFixed(c.label === "CTR" ? 2 : 0) : "—"}
              {c.label === "CTR" ? "%" : ""}
            </span>
            {c.deltaPct != null && (
              <span
                style={{
                  fontWeight: 700,
                  color: positive ? "#166534" : negative ? "#991b1b" : "#64748b",
                }}
              >
                {positive ? "+" : ""}
                {c.deltaPct.toFixed(0)}%
              </span>
            )}
          </span>
        );
      })}
    </div>
  );
}

export default async function PortalAdAuditTrailPage({
  params,
}: {
  params: Promise<{ clientId: string; adId: string }>;
}) {
  const { clientId: rawClientId, adId } = await params;
  const clientId = Number(rawClientId);

  const viewer = await getViewer();
  if (!canViewClient(viewer, clientId)) notFound();

  const supabase = await createClient();

  const [adRes, actionsRes, decisionsRes, learningsRes, variantsRes] = await Promise.all([
    supabase
      .from("ads")
      .select("*, campaigns(id, name)")
      .eq("id", adId)
      .eq("client_id", clientId)
      .single(),
    supabase
      .from("ad_actions")
      .select("*")
      .eq("ad_id", adId)
      .order("created_at", { ascending: false }),
    supabase
      .from("ad_decisions")
      .select("*")
      .eq("ad_id", adId)
      .order("created_at", { ascending: false }),
    supabase
      .from("action_learnings")
      .select("*")
      .eq("ad_id", adId)
      .order("created_at", { ascending: false }),
    supabase
      .from("experiment_variants")
      .select("*, experiments(id, title, hypothesis, status, outcome)")
      .eq("ad_id", adId)
      .order("created_at", { ascending: false }),
  ]);

  if (adRes.error || !adRes.data) notFound();

  const ad = adRes.data as any;
  const actions = (actionsRes.data ?? []) as any[];
  const decisions = (decisionsRes.data ?? []) as any[];
  const learnings = (learningsRes.data ?? []) as any[];
  const variants = (variantsRes.data ?? []) as any[];

  // ── Fold every source into a single chronological timeline ──────────────
  const events: TimelineEvent[] = [];

  if (ad.created_at) {
    events.push({
      id: `ad-${ad.id}`,
      at: ad.created_at,
      kind: "ad_created",
      title: `Ad created — "${ad.name}"`,
      detail: ad.audience ? `Audience: ${ad.audience}` : null,
    });
  }

  for (const a of actions) {
    events.push({
      id: `action-${a.id}-proposed`,
      at: a.created_at,
      kind: "action_proposed",
      title: KIND_LABEL.action_proposed,
      why: a.problem ?? null,
      detail: a.action ?? null,
    });
    if (a.status === "completed" && a.completed_at) {
      events.push({
        id: `action-${a.id}-completed`,
        at: a.completed_at,
        kind: "action_completed",
        title: KIND_LABEL.action_completed,
        why: a.action ?? null,
        detail: a.result_summary ?? null,
        operatorNote: (a as any).operator_note ?? null,
        before: snap(a.metric_snapshot_before),
        after: snap(a.metric_snapshot_after),
        outcome: (a.outcome as any) ?? null,
      });
    }
  }

  for (const d of decisions) {
    events.push({
      id: `decision-${d.id}-proposed`,
      at: d.created_at,
      kind: "decision_proposed",
      title: `${KIND_LABEL.decision_proposed} — ${d.type ?? "unknown"}`,
      why: d.reason ?? null,
      detail: d.action ?? null,
    });
    if (d.status === "rejected") {
      events.push({
        id: `decision-${d.id}-rejected`,
        at: d.approved_at ?? d.created_at,
        kind: "decision_rejected",
        title: KIND_LABEL.decision_rejected,
        detail: d.action ?? null,
      });
    }
    if (d.approved_at && d.status !== "rejected") {
      events.push({
        id: `decision-${d.id}-approved`,
        at: d.approved_at,
        kind: "decision_approved",
        title: KIND_LABEL.decision_approved,
        detail: d.action ?? null,
      });
    }
    if (d.executed_at) {
      events.push({
        id: `decision-${d.id}-executed`,
        at: d.executed_at,
        kind: "decision_executed",
        title: KIND_LABEL.decision_executed,
        why: d.reason ?? null,
        detail: d.execution_result ?? d.action ?? null,
      });
    }
  }

  for (const l of learnings) {
    events.push({
      id: `learning-${l.id}`,
      at: l.created_at,
      kind: "learning_recorded",
      title: KIND_LABEL.learning_recorded,
      why: l.problem ?? null,
      detail: l.learning ?? null,
      before: snap(l.metric_before),
      after: snap(l.metric_after),
      outcome: (l.outcome as any) ?? null,
    });
  }

  for (const v of variants) {
    const exp = Array.isArray(v.experiments) ? v.experiments[0] : v.experiments;
    events.push({
      id: `variant-${v.id}`,
      at: v.created_at,
      kind: "experiment_joined",
      title: `${KIND_LABEL.experiment_joined}: ${exp?.title ?? "untitled"}`,
      why: exp?.hypothesis ?? null,
      detail: v.role ? `Role: ${v.role}${v.label ? ` (${v.label})` : ""}` : null,
      before: snap(v.snapshot_before),
      after: snap(v.snapshot_after),
      outcome: (exp?.outcome as any) ?? null,
    });
  }

  events.sort((a, b) => {
    const cmp = new Date(b.at).getTime() - new Date(a.at).getTime();
    if (cmp !== 0) return cmp;
    return a.id.localeCompare(b.id);
  });

  const impressions = Number(ad.impressions ?? 0);
  const clicks = Number(ad.clicks ?? 0);
  const spend = Number(ad.spend ?? 0);
  const ctr = impressions > 0 ? Number(((clicks / impressions) * 100).toFixed(2)) : 0;
  const cpc = clicks > 0 ? Number((spend / clicks).toFixed(2)) : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Breadcrumb */}
      <div>
        <Link
          href={`/portal/${clientId}/ads`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 13,
            color: "#64748b",
            textDecoration: "none",
            marginBottom: 14,
          }}
        >
          ← Back to ads
        </Link>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, color: "#0f172a" }}>
          {ad.name}
        </h1>
        <p style={{ margin: "6px 0 0", fontSize: 13, color: "#64748b" }}>
          Campaign: {(ad.campaigns as any)?.name ?? "—"}
          {ad.audience ? ` · Audience: ${ad.audience}` : ""}
        </p>
      </div>

      {/* Current state */}
      <section
        style={{
          background: "#fff",
          border: "1px solid #e2e8f0",
          borderRadius: 12,
          padding: 20,
        }}
      >
        <h2 style={{ fontSize: 14, fontWeight: 600, margin: "0 0 14px", color: "#0f172a" }}>
          Where it stands
        </h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
            gap: 12,
          }}
        >
          {[
            { label: "Spend", value: `$${spend.toFixed(0)}` },
            { label: "Impressions", value: impressions.toLocaleString() },
            { label: "Clicks", value: clicks.toLocaleString() },
            { label: "CTR", value: ctr > 0 ? `${ctr}%` : "—" },
            { label: "CPC", value: cpc > 0 ? `$${cpc}` : "—" },
            { label: "Conversions", value: String(Number(ad.conversions ?? 0)) },
          ].map((stat) => (
            <div
              key={stat.label}
              style={{
                padding: 12,
                background: "#f8fafc",
                borderRadius: 10,
              }}
            >
              <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                {stat.label}
              </div>
              <div style={{ marginTop: 4, fontSize: 16, fontWeight: 700, color: "#0f172a" }}>
                {stat.value}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Audit trail */}
      <section
        style={{
          background: "#fff",
          border: "1px solid #e2e8f0",
          borderRadius: 12,
          padding: 20,
        }}
      >
        <h2 style={{ fontSize: 14, fontWeight: 600, margin: "0 0 4px", color: "#0f172a" }}>
          Everything we&rsquo;ve done ({events.length})
        </h2>
        <p style={{ margin: "0 0 16px", fontSize: 12, color: "#64748b" }}>
          Newest first. Every action your operator took, every decision the
          system proposed, every learning recorded — all in one place.
        </p>

        {events.length === 0 ? (
          <div
            style={{
              padding: 24,
              textAlign: "center",
              color: "#94a3b8",
              fontSize: 13,
            }}
          >
            No history yet. Events will appear here as work is done.
          </div>
        ) : (
          <div style={{ position: "relative" }}>
            {events.map((e, idx) => {
              const dot = KIND_DOT[e.kind];
              const isLast = idx === events.length - 1;
              const outcomePalette = e.outcome ? OUTCOME_PALETTE[e.outcome] : null;

              return (
                <div
                  key={e.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "120px 24px 1fr",
                    gap: 12,
                    paddingBottom: isLast ? 0 : 18,
                    position: "relative",
                  }}
                >
                  <div style={{ paddingTop: 2 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#0f172a" }}>
                      {relativeDate(e.at)}
                    </div>
                    <div style={{ fontSize: 11, color: "#94a3b8" }}>
                      {exactTime(e.at)}
                    </div>
                  </div>

                  <div
                    style={{
                      position: "relative",
                      display: "flex",
                      justifyContent: "center",
                    }}
                  >
                    <div
                      style={{
                        width: 12,
                        height: 12,
                        borderRadius: "50%",
                        background: dot,
                        marginTop: 4,
                        zIndex: 1,
                        border: "2px solid #fff",
                        boxShadow: `0 0 0 1px ${dot}`,
                      }}
                    />
                    {!isLast && (
                      <div
                        style={{
                          position: "absolute",
                          top: 16,
                          bottom: -18,
                          width: 2,
                          background: "#e2e8f0",
                        }}
                      />
                    )}
                  </div>

                  <div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        flexWrap: "wrap",
                      }}
                    >
                      <span style={{ fontSize: 14, fontWeight: 600, color: "#0f172a" }}>
                        {e.title}
                      </span>
                      {outcomePalette && (
                        <span
                          style={{
                            padding: "2px 8px",
                            borderRadius: 999,
                            fontSize: 10,
                            fontWeight: 700,
                            background: outcomePalette.bg,
                            color: outcomePalette.fg,
                            textTransform: "uppercase",
                            letterSpacing: "0.04em",
                          }}
                        >
                          {e.outcome}
                        </span>
                      )}
                    </div>
                    {e.why && (
                      <div
                        style={{
                          marginTop: 4,
                          fontSize: 13,
                          color: "#475569",
                          lineHeight: 1.5,
                        }}
                      >
                        <span style={{ color: "#94a3b8", fontWeight: 600 }}>Why:</span>{" "}
                        {e.why}
                      </div>
                    )}
                    {e.detail && (
                      <div
                        style={{
                          marginTop: 2,
                          fontSize: 13,
                          color: "#0f172a",
                          lineHeight: 1.5,
                        }}
                      >
                        {e.detail}
                      </div>
                    )}
                    {e.operatorNote && (
                      <div
                        style={{
                          marginTop: 6,
                          padding: "8px 10px",
                          background: "#f0f9ff",
                          border: "1px solid #bae6fd",
                          borderRadius: 8,
                          fontSize: 13,
                          color: "#0c4a6e",
                          lineHeight: 1.5,
                        }}
                      >
                        <span style={{ fontWeight: 600 }}>Note from your team:</span>{" "}
                        {e.operatorNote}
                      </div>
                    )}
                    <MetricDelta before={e.before ?? null} after={e.after ?? null} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
