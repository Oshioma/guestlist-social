// ---------------------------------------------------------------------------
// TopPriorities — the calmest surface in the product, dropped onto the
// dashboard.
//
// We scan every pending action and decision across every active client,
// score each by (confidence × priority), and surface the top three as full
// trust cards the operator can approve, reject, or execute without leaving
// the page. Anything below the cut is hidden — that's the point. The
// dashboard's job is to focus attention, not to inventory work.
//
// Scoring rationale:
//   confidence dominates priority, because acting on a high-confidence
//   medium-priority move is a safer bet than acting on a low-confidence
//   high-priority guess. Within a tier, more recent rows win the tiebreak.
//
// This is a server component on purpose — every dependency (Supabase, the
// trust helpers) is server-only, and the inner AdActionRow / DecisionRow
// hand off interactivity from there.
// ---------------------------------------------------------------------------

import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import EmptyState from "@/app/admin-panel/components/EmptyState";
import SectionCard from "@/app/admin-panel/components/SectionCard";
import AdActionRow from "@/app/admin-panel/components/AdActionRow";
import DecisionRow from "@/app/admin-panel/components/DecisionRow";
import {
  deriveConfidence,
  decisionConfidence,
  formatEvidence,
  formatExpectedOutcome,
  formatLastSimilar,
  formatDecisionEvidence,
  formatDecisionLastSimilar,
  type Confidence,
  type PatternStats,
  type LastSimilar,
  type DecisionTypeStats,
  type LastDecision,
} from "@/app/admin-panel/lib/action-confidence";

type Candidate =
  | {
      kind: "action";
      score: number;
      created_at: string;
      client_id: number;
      client_name: string;
      action: any;
    }
  | {
      kind: "decision";
      score: number;
      created_at: string;
      client_id: number;
      client_name: string;
      decision: any;
    };

const CONF_RANK: Record<Confidence, number> = {
  high: 4,
  medium: 3,
  low: 2,
  unknown: 1,
};

const PRIORITY_RANK: Record<string, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

const TOP_N = 3;

export default async function TopPriorities() {
  const supabase = await createClient();

  // ── Fetch pending actions + decisions across all active clients ─────────
  const [clientsRes, actionsRes, decisionsRes] = await Promise.all([
    supabase.from("clients").select("id, name").eq("archived", false),
    supabase
      .from("ad_actions")
      .select("*, ads!inner(id, name, client_id)")
      .eq("status", "pending")
      .order("created_at", { ascending: false }),
    supabase
      .from("ad_decisions")
      .select("*, ads(name)")
      .eq("status", "pending")
      .order("created_at", { ascending: false }),
  ]);

  const clientMap = new Map<number, string>();
  for (const c of clientsRes.data ?? []) {
    clientMap.set((c as any).id, (c as any).name);
  }

  const rawActions = (actionsRes.data ?? []) as any[];
  const rawDecisions = (decisionsRes.data ?? []) as any[];

  // ── Trust enrichment (same shape as the per-client page) ────────────────
  const patternKeys = Array.from(
    new Set(
      rawActions
        .map((a) => a.validated_pattern_key)
        .filter((k): k is string => typeof k === "string" && k.length > 0)
    )
  );
  const patternStatsByKey = new Map<string, PatternStats>();
  const lastSimilarByKey = new Map<string, LastSimilar>();

  if (patternKeys.length > 0) {
    const [globalRes, similarRes] = await Promise.all([
      supabase
        .from("global_learnings")
        .select(
          "pattern_key, pattern_label, action_summary, times_seen, unique_clients, positive_count, neutral_count, negative_count, consistency_score, avg_ctr_lift, avg_cpc_change"
        )
        .in("pattern_key", patternKeys),
      supabase
        .from("ad_actions")
        .select(
          "validated_pattern_key, outcome, completed_at, metric_snapshot_before, metric_snapshot_after, ads(name)"
        )
        .in("validated_pattern_key", patternKeys)
        .eq("status", "completed")
        .not("completed_at", "is", null)
        .order("completed_at", { ascending: false })
        .limit(200),
    ]);

    for (const row of globalRes.data ?? []) {
      patternStatsByKey.set((row as any).pattern_key, row as PatternStats);
    }
    for (const row of similarRes.data ?? []) {
      const key = (row as any).validated_pattern_key as string;
      if (lastSimilarByKey.has(key)) continue;
      const before = (row as any).metric_snapshot_before;
      const after = (row as any).metric_snapshot_after;
      const adRel = (row as any).ads;
      const adName = Array.isArray(adRel)
        ? adRel[0]?.name ?? null
        : adRel?.name ?? null;
      lastSimilarByKey.set(key, {
        ad_name: adName,
        outcome: (row as any).outcome ?? null,
        ctr_before: before?.ctr ?? null,
        ctr_after: after?.ctr ?? null,
        completed_at: (row as any).completed_at ?? null,
      });
    }
  }

  const decisionTypes = Array.from(
    new Set(
      rawDecisions
        .map((d) => d.type)
        .filter((t): t is string => typeof t === "string" && t.length > 0)
    )
  );
  const decisionStatsByType = new Map<string, DecisionTypeStats>();
  const lastDecisionByType = new Map<string, LastDecision>();

  if (decisionTypes.length > 0) {
    const { data: history } = await supabase
      .from("ad_decisions")
      .select("type, status, executed_at, execution_result, ads(name)")
      .in("type", decisionTypes)
      .neq("status", "pending")
      .order("executed_at", { ascending: false, nullsFirst: false })
      .limit(500);

    for (const row of history ?? []) {
      const type = (row as any).type as string;
      const status = (row as any).status as string;
      const stats = decisionStatsByType.get(type) ?? {
        type,
        total: 0,
        executed: 0,
        approved: 0,
        rejected: 0,
      };
      stats.total += 1;
      if (status === "executed") stats.executed += 1;
      else if (status === "approved") stats.approved += 1;
      else if (status === "rejected") stats.rejected += 1;
      decisionStatsByType.set(type, stats);

      if (!lastDecisionByType.has(type) && status !== "rejected") {
        const adRel = (row as any).ads;
        const adName = Array.isArray(adRel)
          ? adRel[0]?.name ?? null
          : adRel?.name ?? null;
        lastDecisionByType.set(type, {
          ad_name: adName,
          status,
          executed_at: (row as any).executed_at ?? null,
          execution_result: (row as any).execution_result ?? null,
        });
      }
    }
  }

  // ── Score and merge ─────────────────────────────────────────────────────
  const candidates: Candidate[] = [];

  for (const a of rawActions) {
    const clientId = (a.ads as any)?.client_id;
    if (!clientId || !clientMap.has(clientId)) continue;
    const stats = a.validated_pattern_key
      ? patternStatsByKey.get(a.validated_pattern_key) ?? null
      : null;
    const conf = deriveConfidence(stats);
    const priorityRank = PRIORITY_RANK[a.priority ?? "medium"] ?? 2;
    candidates.push({
      kind: "action",
      score: CONF_RANK[conf] * 10 + priorityRank,
      created_at: a.created_at,
      client_id: clientId,
      client_name: clientMap.get(clientId)!,
      action: {
        id: a.id,
        ad_id: a.ad_id,
        ad_name: (a.ads as any)?.name ?? "Unknown ad",
        problem: a.problem ?? "",
        action: a.action ?? "",
        priority: a.priority ?? "medium",
        status: a.status ?? "pending",
        hypothesis: a.hypothesis,
        validated_by: a.validated_by,
        outcome: a.outcome,
        result_summary: a.result_summary,
        metric_snapshot_before: a.metric_snapshot_before,
        metric_snapshot_after: a.metric_snapshot_after,
        completed_at: a.completed_at,
        confidence: conf,
        evidence: formatEvidence(stats),
        expected_outcome: formatExpectedOutcome(stats),
        last_similar: formatLastSimilar(
          a.validated_pattern_key
            ? lastSimilarByKey.get(a.validated_pattern_key) ?? null
            : null
        ),
      },
    });
  }

  for (const d of rawDecisions) {
    if (!d.client_id || !clientMap.has(d.client_id)) continue;
    const conf = decisionConfidence(d.confidence);
    const stats = d.type ? decisionStatsByType.get(d.type) ?? null : null;
    const last = d.type ? lastDecisionByType.get(d.type) ?? null : null;
    // Decisions don't carry an explicit priority — treat them as "medium"
    // for the tiebreak. Confidence still dominates.
    candidates.push({
      kind: "decision",
      score: CONF_RANK[conf] * 10 + 2,
      created_at: d.created_at,
      client_id: d.client_id,
      client_name: clientMap.get(d.client_id)!,
      decision: {
        id: d.id,
        ad_id: d.ad_id,
        ad_name: (d.ads as any)?.name ?? "Unknown ad",
        type: d.type,
        reason: d.reason,
        action: d.action,
        confidence: d.confidence,
        meta_action: d.meta_action,
        status: d.status,
        execution_result: d.execution_result,
        evidence: formatDecisionEvidence(stats),
        last_similar: formatDecisionLastSimilar(last),
      },
    });
  }

  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  const top = candidates.slice(0, TOP_N);
  const remaining = candidates.length - top.length;

  return (
    <SectionCard title="Today's top priorities">
      <p style={{ fontSize: 12, color: "#71717a", margin: "0 0 14px" }}>
        The three highest-confidence moves across all clients. Do these first;
        everything else can wait.
      </p>

      {top.length === 0 ? (
        <EmptyState
          title="Nothing to do"
          description="No pending actions or decisions across any client. Hit Refresh on a client to score their ads, or generate decisions."
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {top.map((c, idx) => (
            <div key={`${c.kind}-${c.kind === "action" ? c.action.id : c.decision.id}`}>
              {/* Rank + client header — turns "an action" into "Trust Test
                  Co's action", which is the context the operator needs. */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  marginBottom: 8,
                }}
              >
                <span
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: "50%",
                    background: "#18181b",
                    color: "#fff",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  {idx + 1}
                </span>
                <Link
                  href={`/app/clients/${c.client_id}/ads`}
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: "#27272a",
                    textDecoration: "none",
                  }}
                >
                  {c.client_name}
                </Link>
                <span style={{ fontSize: 12, color: "#a1a1aa" }}>
                  {c.kind === "action" ? "Action" : "Decision"}
                </span>
              </div>
              {c.kind === "action" ? (
                <AdActionRow action={c.action} />
              ) : (
                <DecisionRow decision={c.decision} />
              )}
            </div>
          ))}
        </div>
      )}

      {remaining > 0 && (
        <p style={{ fontSize: 12, color: "#a1a1aa", margin: "16px 0 0" }}>
          {remaining} more pending {remaining === 1 ? "item" : "items"} are
          hidden — open a client to see the full queue.
        </p>
      )}
    </SectionCard>
  );
}
