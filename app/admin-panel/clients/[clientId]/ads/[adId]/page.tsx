// ---------------------------------------------------------------------------
// Per-ad audit trail.
//
// One page, one promise: every meaningful thing the system has ever done to
// this ad, in chronological order, with the *why* on every line. This is the
// trust anchor — the place a client (or an operator on their behalf) can go
// to ask "what happened, who decided, and was it right?" and walk away with
// a clear answer.
//
// We pull from five sources and fold them into a single timeline:
//   1. ads.created_at                  → "Ad created"
//   2. ad_actions                      → proposed / completed (with before→after)
//   3. ad_decisions                    → proposed / approved / rejected / executed
//   4. action_learnings                → "Learning recorded"
//   5. experiment_variants/experiments → "Joined experiment"
//
// The timeline is rendered newest-first. Every event leads with a calm
// timestamp + colored dot, then the human-readable headline, then the why,
// then any supporting facts (before/after, outcome badge).
// ---------------------------------------------------------------------------

import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import EmptyState from "@/app/admin-panel/components/EmptyState";
import SectionCard from "@/app/admin-panel/components/SectionCard";
import { formatCurrency } from "@/app/admin-panel/lib/utils";
import {
  getAppPerformanceStatus,
  getPerformanceScore,
  explainPerformanceStatus,
} from "@/app/admin-panel/lib/performance-truth";
import {
  confidencePalette,
  decisionConfidence,
} from "@/app/admin-panel/lib/action-confidence";

export const dynamic = "force-dynamic";

// ── Event model ────────────────────────────────────────────────────────────
// Every row in the timeline is one of these. Keeping it flat makes the merge
// trivial (concat + sort by `at`) and the renderer dumb (one switch on `kind`).
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
  at: string; // ISO timestamp
  kind: EventKind;
  title: string;
  why?: string | null;
  detail?: string | null;
  before?: MetricSnapshot;
  after?: MetricSnapshot;
  outcome?: "positive" | "neutral" | "negative" | null;
  confidence?: "high" | "medium" | "low" | "unknown" | null;
  // Optional jump-to-source link. Action / decision / experiment events all
  // know how to find their row on the per-client ads page via a hash anchor;
  // events without a UI representation (ad_created, learning_recorded) leave
  // this null.
  sourceHref?: string | null;
  sourceLabel?: string | null;
};

// Calm color palette per event kind. The whole page should feel like a
// control-room log — no shouting, no emoji, just steady categorical color.
const KIND_DOT: Record<EventKind, string> = {
  ad_created: "#a1a1aa",
  action_proposed: "#d97706",
  action_completed: "#166534",
  decision_proposed: "#1e40af",
  decision_approved: "#1e40af",
  decision_rejected: "#71717a",
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
  decision_rejected: "Decision rejected",
  decision_executed: "Decision executed",
  learning_recorded: "Learning recorded",
  experiment_joined: "Joined experiment",
};

const OUTCOME_PALETTE: Record<
  "positive" | "neutral" | "negative",
  { bg: string; fg: string; border: string }
> = {
  positive: { bg: "#ecfdf5", fg: "#065f46", border: "#a7f3d0" },
  neutral: { bg: "#f4f4f5", fg: "#52525b", border: "#e4e4e7" },
  negative: { bg: "#fef2f2", fg: "#991b1b", border: "#fecaca" },
};

// "today" / "yesterday" / "Mar 12" / "Mar 12, 2025"
function relativeDate(iso: string): string {
  const then = new Date(iso);
  const now = new Date();
  const ms = now.getTime() - then.getTime();
  const days = Math.floor(ms / 86_400_000);
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

// Pull a clean number out of the JSON snapshots Meta sync writes. We accept
// either { ctr: 1.2 } or { CTR: "1.20" } and coerce to a finite number, or
// return null if there's nothing trustworthy to render.
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

// One row of "before → after" pills. Only renders metrics that moved.
function MetricDelta({
  before,
  after,
}: {
  before: MetricSnapshot;
  after: MetricSnapshot;
}) {
  if (!before && !after) return null;

  const fields: { key: keyof NonNullable<MetricSnapshot>; label: string; pct: boolean }[] = [
    { key: "ctr", label: "CTR", pct: true },
    { key: "cpc", label: "CPC", pct: false },
    { key: "spend", label: "Spend", pct: false },
    { key: "conversions", label: "Conv", pct: false },
  ];

  const cells = fields
    .map(({ key, label, pct }) => {
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
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 6,
        marginTop: 8,
      }}
    >
      {cells.map((c) => {
        const positive = c.deltaPct != null && c.deltaPct > 0;
        const negative = c.deltaPct != null && c.deltaPct < 0;
        return (
          <span
            key={c.label}
            style={{
              padding: "4px 10px",
              borderRadius: 8,
              background: "#fafafa",
              border: "1px solid #f4f4f5",
              fontSize: 11,
              color: "#52525b",
              display: "inline-flex",
              gap: 6,
              alignItems: "center",
            }}
          >
            <span style={{ fontWeight: 600, color: "#71717a" }}>{c.label}</span>
            <span style={{ color: "#71717a" }}>
              {c.before != null ? c.before.toFixed(c.label === "CTR" ? 2 : 0) : "—"}
              {c.label === "CTR" ? "%" : ""}
            </span>
            <span style={{ color: "#a1a1aa" }}>→</span>
            <span style={{ color: "#27272a", fontWeight: 600 }}>
              {c.after != null ? c.after.toFixed(c.label === "CTR" ? 2 : 0) : "—"}
              {c.label === "CTR" ? "%" : ""}
            </span>
            {c.deltaPct != null && (
              <span
                style={{
                  fontWeight: 700,
                  color: positive ? "#166534" : negative ? "#991b1b" : "#71717a",
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

export default async function AdAuditTrailPage({
  params,
}: {
  params: Promise<{ clientId: string; adId: string }>;
}) {
  const { clientId, adId } = await params;
  const supabase = await createClient();

  // ── Fetch the ad and every related history row in parallel ──────────────
  const [
    clientRes,
    adRes,
    actionsRes,
    decisionsRes,
    learningsRes,
    variantsRes,
  ] = await Promise.all([
    supabase.from("clients").select("id, name").eq("id", clientId).single(),
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

  if (clientRes.error || !clientRes.data) {
    return <EmptyState title="Client not found" />;
  }
  if (adRes.error || !adRes.data) {
    return <EmptyState title="Ad not found" description="It may have been removed or belongs to another client." />;
  }

  const client = clientRes.data;
  const ad = adRes.data as any;
  const actions = (actionsRes.data ?? []) as any[];
  const decisions = (decisionsRes.data ?? []) as any[];
  const learnings = (learningsRes.data ?? []) as any[];
  const variants = (variantsRes.data ?? []) as any[];

  // ── Derive current performance for the header ───────────────────────────
  const impressions = Number(ad.impressions ?? 0);
  const clicks = Number(ad.clicks ?? 0);
  const spend = Number(ad.spend ?? 0);
  const ctr = impressions > 0 ? Number(((clicks / impressions) * 100).toFixed(2)) : 0;
  const cpc = clicks > 0 ? Number((spend / clicks).toFixed(4)) : 0;
  const forScoring = {
    status: ad.status,
    meta_status: ad.meta_status,
    spend,
    impressions,
    clicks,
    ctr,
    cpc,
    conversions: Number(ad.conversions ?? 0),
    cost_per_result: Number(ad.cost_per_result ?? 0),
  };
  const perfStatus = getAppPerformanceStatus(forScoring);
  const perfScore = getPerformanceScore(forScoring);
  const perfReason = explainPerformanceStatus(forScoring);

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

  // Every action / decision / experiment row gets the same anchor target on
  // the per-client ads page (`#action-<id>` etc.). The audit trail uses these
  // to jump straight to the source row in its native context — the queue or
  // experiment list — without losing the trail position.
  const actionHref = (id: string) => `/app/clients/${clientId}/ads#action-${id}`;
  const decisionHref = (id: number) =>
    `/app/clients/${clientId}/ads#decision-${id}`;
  const experimentHref = (id: number) =>
    `/app/clients/${clientId}/ads#experiment-${id}`;

  for (const a of actions) {
    // Every action contributes a "proposed" event…
    events.push({
      id: `action-${a.id}-proposed`,
      at: a.created_at,
      kind: "action_proposed",
      title: KIND_LABEL.action_proposed,
      why: a.problem ?? null,
      detail: a.action ?? null,
      confidence: null, // proposals don't carry a stored confidence yet
      sourceHref: actionHref(a.id),
      sourceLabel: "Open in action queue",
    });

    // …and, if it ran to completion, a separate "completed" event with the
    // before→after snapshot. Splitting them keeps the timeline honest about
    // when each thing actually happened.
    if (a.status === "completed" && a.completed_at) {
      events.push({
        id: `action-${a.id}-completed`,
        at: a.completed_at,
        kind: "action_completed",
        title: KIND_LABEL.action_completed,
        why: a.action ?? null,
        detail: a.result_summary ?? null,
        before: snap(a.metric_snapshot_before),
        after: snap(a.metric_snapshot_after),
        outcome: (a.outcome as any) ?? null,
        sourceHref: actionHref(a.id),
        sourceLabel: "Open in action queue",
      });
    }
  }

  for (const d of decisions) {
    const dHref = decisionHref(d.id);
    const dLabel = "Open in decision queue";
    events.push({
      id: `decision-${d.id}-proposed`,
      at: d.created_at,
      kind: "decision_proposed",
      title: `${KIND_LABEL.decision_proposed} — ${d.type ?? "unknown"}`,
      why: d.reason ?? null,
      detail: d.action ?? null,
      confidence: decisionConfidence(d.confidence),
      sourceHref: dHref,
      sourceLabel: dLabel,
    });

    if (d.status === "rejected") {
      // We don't store a rejection timestamp, so anchor it to created_at + 1ms
      // so it sorts immediately after the proposal. Cheap, deterministic.
      events.push({
        id: `decision-${d.id}-rejected`,
        at: d.approved_at ?? d.created_at,
        kind: "decision_rejected",
        title: KIND_LABEL.decision_rejected,
        detail: d.action ?? null,
        sourceHref: dHref,
        sourceLabel: dLabel,
      });
    }
    if (d.approved_at && d.status !== "rejected") {
      events.push({
        id: `decision-${d.id}-approved`,
        at: d.approved_at,
        kind: "decision_approved",
        title: KIND_LABEL.decision_approved,
        detail: d.action ?? null,
        sourceHref: dHref,
        sourceLabel: dLabel,
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
        sourceHref: dHref,
        sourceLabel: dLabel,
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
      sourceHref: exp?.id ? experimentHref(exp.id) : null,
      sourceLabel: exp?.id ? "Open experiment" : null,
    });
  }

  // Newest first. Stable on ties to keep the rejected/approved pair tidy.
  events.sort((a, b) => {
    const cmp = new Date(b.at).getTime() - new Date(a.at).getTime();
    if (cmp !== 0) return cmp;
    return a.id.localeCompare(b.id);
  });

  const perfBadge: Record<string, { bg: string; text: string }> = {
    winner: { bg: "#dcfce7", text: "#166534" },
    losing: { bg: "#fee2e2", text: "#991b1b" },
    testing: { bg: "#fef3c7", text: "#92400e" },
    paused: { bg: "#f4f4f5", text: "#71717a" },
  };
  const pb = perfBadge[perfStatus] ?? perfBadge.testing;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* ── Breadcrumb + title ───────────────────────────────────────── */}
      <div>
        <Link
          href={`/app/clients/${clientId}/ads`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 13,
            color: "#71717a",
            textDecoration: "none",
            marginBottom: 14,
          }}
        >
          &larr; Back to {client.name} ads
        </Link>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <h2 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>{ad.name}</h2>
          <span
            style={{
              padding: "2px 12px",
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 600,
              background: pb.bg,
              color: pb.text,
              textTransform: "capitalize",
            }}
          >
            {perfStatus}
          </span>
          <span
            style={{
              fontSize: 13,
              fontWeight: 700,
              color:
                perfScore >= 3
                  ? "#166534"
                  : perfScore <= -2
                  ? "#991b1b"
                  : "#71717a",
            }}
          >
            {perfScore > 0 ? `+${perfScore}` : perfScore}
          </span>
        </div>
        <p style={{ fontSize: 13, color: "#71717a", margin: "6px 0 0" }}>
          {perfReason}
        </p>
        <p style={{ fontSize: 12, color: "#a1a1aa", margin: "2px 0 0" }}>
          Campaign: {(ad.campaigns as any)?.name ?? "—"}
          {ad.audience ? ` · Audience: ${ad.audience}` : ""}
        </p>
      </div>

      {/* ── Current state at a glance ───────────────────────────────── */}
      <SectionCard title="Current state">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(6, minmax(0, 1fr))",
            gap: 12,
          }}
        >
          {[
            { label: "Spend", value: formatCurrency(spend) },
            { label: "Impressions", value: impressions.toLocaleString() },
            { label: "Clicks", value: clicks.toLocaleString() },
            { label: "CTR", value: ctr > 0 ? `${ctr}%` : "—" },
            { label: "CPC", value: cpc > 0 ? formatCurrency(cpc) : "—" },
            { label: "Conversions", value: String(forScoring.conversions) },
          ].map((stat) => (
            <div
              key={stat.label}
              style={{
                border: "1px solid #f4f4f5",
                borderRadius: 12,
                padding: 12,
                background: "#fafafa",
              }}
            >
              <div style={{ fontSize: 11, color: "#71717a" }}>{stat.label}</div>
              <div style={{ marginTop: 4, fontSize: 16, fontWeight: 700 }}>
                {stat.value}
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* ── Audit trail ─────────────────────────────────────────────── */}
      <SectionCard title={`Audit trail (${events.length})`}>
        <p style={{ fontSize: 12, color: "#71717a", margin: "0 0 16px" }}>
          Every action, decision, and learning the system has recorded for this
          ad — newest first. Use this to answer: <em>what happened, why, and
          was it right?</em>
        </p>

        {events.length === 0 ? (
          <EmptyState
            title="No history yet"
            description="Events will appear here as the system proposes actions, makes decisions, and records learnings for this ad."
          />
        ) : (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 0,
              position: "relative",
            }}
          >
            {events.map((e, idx) => {
              const dot = KIND_DOT[e.kind];
              const isLast = idx === events.length - 1;
              const outcomePalette = e.outcome
                ? OUTCOME_PALETTE[e.outcome]
                : null;
              const confPalette =
                e.confidence && e.confidence !== "unknown"
                  ? confidencePalette(e.confidence)
                  : null;

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
                  {/* Timestamp gutter */}
                  <div style={{ paddingTop: 2 }}>
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: "#27272a",
                      }}
                    >
                      {relativeDate(e.at)}
                    </div>
                    <div style={{ fontSize: 11, color: "#a1a1aa" }}>
                      {exactTime(e.at)}
                    </div>
                  </div>

                  {/* Spine: dot + connector line */}
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
                          background: "#f4f4f5",
                        }}
                      />
                    )}
                  </div>

                  {/* Event body */}
                  <div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        flexWrap: "wrap",
                      }}
                    >
                      <span
                        style={{
                          fontSize: 14,
                          fontWeight: 600,
                          color: "#18181b",
                        }}
                      >
                        {e.title}
                      </span>
                      {confPalette && (
                        <span
                          style={{
                            padding: "2px 8px",
                            borderRadius: 999,
                            fontSize: 10,
                            fontWeight: 700,
                            background: confPalette.bg,
                            color: confPalette.fg,
                            border: `1px solid ${confPalette.border}`,
                            textTransform: "uppercase",
                            letterSpacing: "0.04em",
                          }}
                        >
                          {confPalette.label}
                        </span>
                      )}
                      {outcomePalette && (
                        <span
                          style={{
                            padding: "2px 8px",
                            borderRadius: 999,
                            fontSize: 10,
                            fontWeight: 700,
                            background: outcomePalette.bg,
                            color: outcomePalette.fg,
                            border: `1px solid ${outcomePalette.border}`,
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
                          color: "#52525b",
                          lineHeight: 1.5,
                        }}
                      >
                        <span style={{ color: "#71717a", fontWeight: 600 }}>
                          Why:
                        </span>{" "}
                        {e.why}
                      </div>
                    )}
                    {e.detail && (
                      <div
                        style={{
                          marginTop: 2,
                          fontSize: 13,
                          color: "#27272a",
                          lineHeight: 1.5,
                        }}
                      >
                        {e.detail}
                      </div>
                    )}
                    <MetricDelta before={e.before ?? null} after={e.after ?? null} />
                    {e.sourceHref && (
                      <div style={{ marginTop: 6 }}>
                        <Link
                          href={e.sourceHref}
                          style={{
                            fontSize: 11,
                            color: "#1e40af",
                            textDecoration: "none",
                            fontWeight: 600,
                          }}
                        >
                          {e.sourceLabel ?? "Open source"} →
                        </Link>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
