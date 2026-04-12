/**
 * /app/meta-queue — operator approval surface for the Meta execution queue.
 *
 * Lists every meta_execution_queue row, grouped by status (pending first,
 * then approved, then a collapsed history of executed/failed/cancelled).
 * Each row renders as a MetaQueueRow card with approve/preview/execute/
 * cancel buttons. The buttons hit /api/meta-execute-decision — that route
 * is the only thing in the codebase allowed to talk to lib/meta-execute.ts.
 */

import { createClient } from "@/lib/supabase/server";
import MetaQueueRow, {
  type MetaQueueRowData,
} from "@/app/admin-panel/components/MetaQueueRow";
import CrossPollinateButton from "@/app/admin-panel/components/CrossPollinateButton";

export const dynamic = "force-dynamic";

type RawQueueRow = {
  id: number;
  client_id: number | null;
  campaign_id: number | null;
  ad_id: number | null;
  adset_meta_id: string | null;
  ad_meta_id: string | null;
  decision_type: string;
  proposed_payload: Record<string, unknown> | null;
  reason: string | null;
  risk_level: string | null;
  status: string;
  approved_by: string | null;
  approved_at: string | null;
  executed_at: string | null;
  execution_result: unknown;
  execution_error: string | null;
  last_checked_at: string | null;
  last_checked_state: unknown;
  created_at: string;
};

export default async function MetaQueuePage() {
  const supabase = await createClient();

  // Pull the queue. We don't paginate yet — the queue is bounded in
  // practice (the engine writes to it, the operator drains it). If it
  // grows beyond a few hundred rows that's a sign something is broken
  // upstream, not a sign we need pagination.
  const { data: rawRows, error } = await supabase
    .from("meta_execution_queue")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    return (
      <div style={{ padding: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Meta queue</h1>
        <p style={{ color: "#991b1b", marginTop: 12 }}>
          Failed to load queue: {error.message}
        </p>
        <p style={{ color: "#71717a", fontSize: 13, marginTop: 4 }}>
          (Has the migration{" "}
          <code>20260415_meta_execution_queue.sql</code> been applied?)
        </p>
      </div>
    );
  }

  const rows: RawQueueRow[] = rawRows ?? [];

  // Resolve human-readable labels for clients/ads/campaigns in three
  // batched queries rather than per-row. The label maps are small.
  const clientIds = Array.from(
    new Set(rows.map((r) => r.client_id).filter((v): v is number => v != null))
  );
  const adIds = Array.from(
    new Set(rows.map((r) => r.ad_id).filter((v): v is number => v != null))
  );
  const campaignIds = Array.from(
    new Set(rows.map((r) => r.campaign_id).filter((v): v is number => v != null))
  );

  const [clientLabels, adLabels, campaignLabels] = await Promise.all([
    clientIds.length
      ? supabase.from("clients").select("id, name").in("id", clientIds)
      : Promise.resolve({ data: [] }),
    adIds.length
      ? supabase.from("ads").select("id, name").in("id", adIds)
      : Promise.resolve({ data: [] }),
    campaignIds.length
      ? supabase.from("campaigns").select("id, name").in("id", campaignIds)
      : Promise.resolve({ data: [] }),
  ]);

  const clientNameMap = new Map<number, string>();
  for (const c of clientLabels.data ?? []) {
    clientNameMap.set(Number(c.id), String(c.name));
  }
  const adNameMap = new Map<number, string>();
  for (const a of adLabels.data ?? []) {
    adNameMap.set(Number(a.id), String(a.name));
  }
  const campaignNameMap = new Map<number, string>();
  for (const c of campaignLabels.data ?? []) {
    campaignNameMap.set(Number(c.id), String(c.name));
  }

  const normalized: MetaQueueRowData[] = rows.map((r) => ({
    id: r.id,
    decisionType: r.decision_type,
    status: r.status,
    riskLevel: (r.risk_level ?? "low") as MetaQueueRowData["riskLevel"],
    reason: r.reason,
    proposedPayload: r.proposed_payload,
    clientName: r.client_id != null ? clientNameMap.get(r.client_id) ?? null : null,
    adName: r.ad_id != null ? adNameMap.get(r.ad_id) ?? null : null,
    campaignName:
      r.campaign_id != null ? campaignNameMap.get(r.campaign_id) ?? null : null,
    adMetaId: r.ad_meta_id,
    adsetMetaId: r.adset_meta_id,
    approvedBy: r.approved_by,
    approvedAt: r.approved_at,
    executedAt: r.executed_at,
    executionResult: r.execution_result,
    executionError: r.execution_error,
    lastCheckedAt: r.last_checked_at,
    lastCheckedState: r.last_checked_state,
    createdAt: r.created_at,
  }));

  // Bucket: pending → approved → recent history. Cancelled and failed
  // sit alongside executed in "recent" — the operator wants one history
  // tab, not three.
  const pending = normalized.filter((r) => r.status === "pending");
  const approved = normalized.filter((r) => r.status === "approved");
  const recent = normalized.filter((r) =>
    ["executed", "failed", "cancelled"].includes(r.status)
  );

  // Read the dry-run env on the server so the operator sees the truth
  // about what will happen if they hit Execute.
  const dryRunOn = process.env.META_EXECUTE_DRY_RUN !== "false";
  const appSecretConfigured = Boolean(process.env.META_APP_SECRET);

  return (
    <div style={{ padding: 24, maxWidth: 1100 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Action queue</h1>
        <span style={{ color: "#71717a", fontSize: 13 }}>
          {pending.length} waiting on you · {approved.length} ready to send · {recent.length} done
        </span>
      </div>
      <p style={{ color: "#71717a", fontSize: 13, marginTop: 6, maxWidth: 720 }}>
        Every change the engine wants to make to your Meta ads waits here for
        you. Approve to mark it ready, Preview to peek at the live state in
        Meta without changing anything, and Execute to actually make the change.
      </p>

      {/* Mode banner — make the dry-run state impossible to miss */}
      <div
        style={{
          marginTop: 16,
          padding: "12px 14px",
          borderRadius: 10,
          border: `1px solid ${dryRunOn ? "#bfdbfe" : "#fde68a"}`,
          background: dryRunOn ? "#eff6ff" : "#fefce8",
          color: dryRunOn ? "#1e3a8a" : "#854d0e",
          fontSize: 13,
          display: "flex",
          flexDirection: "column",
          gap: 4,
        }}
      >
        <div style={{ fontWeight: 700 }}>
          {dryRunOn ? "Test mode — nothing will reach Meta" : "Live mode — changes will go to Meta"}
        </div>
        <div style={{ fontSize: 12, opacity: 0.85 }}>
          {dryRunOn
            ? "Hitting Execute right now just shows what would happen. To actually push changes to Meta, set META_EXECUTE_DRY_RUN=false in env."
            : "Hitting Execute on a row will make the change in your Meta ad account for real."}
        </div>
        {!appSecretConfigured && (
          <div style={{ fontSize: 12, marginTop: 4, color: "#991b1b", fontWeight: 600 }}>
            META_APP_SECRET is not set — every execute call will fail until it
            is. Writes are signed with appsecret_proof, which requires it.
          </div>
        )}
        <div
          style={{
            marginTop: 8,
            display: "flex",
            gap: 12,
            fontSize: 12,
            flexWrap: "wrap",
          }}
        >
          <a
            href="/api/meta-execute-preflight"
            target="_blank"
            rel="noreferrer"
            style={{
              color: dryRunOn ? "#1d4ed8" : "#854d0e",
              textDecoration: "underline",
              fontWeight: 600,
            }}
          >
            Run preflight ↗
          </a>
          <a
            href="https://github.com/oshioma/guestlist-social/blob/main/docs/meta-execute-runbook.md"
            target="_blank"
            rel="noreferrer"
            style={{
              color: dryRunOn ? "#1d4ed8" : "#854d0e",
              textDecoration: "underline",
              fontWeight: 600,
            }}
          >
            Operator runbook ↗
          </a>
        </div>
      </div>

      {/* Cross-pollinate trigger — closes the loop between
          global_learnings (passive intelligence) and the queue
          (executable actions). */}
      <CrossPollinateButton />

      {/* Pending */}
      <Section title="Waiting on you" count={pending.length}>
        {pending.length === 0 ? (
          <Empty>Nothing waiting on you. The engine hasn&rsquo;t suggested any changes since you last cleared this out.</Empty>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {pending.map((row) => (
              <MetaQueueRow key={row.id} row={row} />
            ))}
          </div>
        )}
      </Section>

      {/* Approved */}
      <Section title="Ready to send" count={approved.length}>
        {approved.length === 0 ? (
          <Empty>Nothing ready to send. Approve a row above to move it here.</Empty>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {approved.map((row) => (
              <MetaQueueRow key={row.id} row={row} />
            ))}
          </div>
        )}
      </Section>

      {/* Recent */}
      <Section title="Done" count={recent.length}>
        {recent.length === 0 ? (
          <Empty>Nothing here yet.</Empty>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {recent.map((row) => (
              <MetaQueueRow key={row.id} row={row} />
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section style={{ marginTop: 28 }}>
      <h2
        style={{
          fontSize: 13,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          color: "#71717a",
          margin: "0 0 12px 0",
        }}
      >
        {title}{" "}
        <span style={{ color: "#a1a1aa", fontWeight: 500 }}>({count})</span>
      </h2>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: 16,
        border: "1px dashed #e4e4e7",
        borderRadius: 10,
        color: "#a1a1aa",
        fontSize: 13,
      }}
    >
      {children}
    </div>
  );
}
