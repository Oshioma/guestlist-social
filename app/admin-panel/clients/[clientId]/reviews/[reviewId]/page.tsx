import Link from "next/link";
import { createClient } from "../../../../../../lib/supabase/server";
import SectionCard from "../../../../components/SectionCard";
import EmptyState from "../../../../components/EmptyState";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Read-only review page.
//
// Renders one row from `reviews` plus its `review_approvals` children as a
// "60-second narrative" the client can scan: cover block → what happened →
// what improved → what we tested → what we learned → what we're doing next.
//
// The "approve / decline / change" controls in the "What's next" section are
// rendered here as static checkboxes — wiring them through to ad_actions and
// ad_decisions is step 2 of the client review layer.
// ---------------------------------------------------------------------------

type ImprovementCard = {
  metric: string;
  before: string;
  after: string;
  delta_pct: number;
  direction: "up" | "down" | "flat";
  layman: string;
};

type TestItem = {
  ad_name: string;
  hypothesis: string;
  result: string;
  outcome: "positive" | "neutral" | "negative";
  symbol: "✓" | "•" | "✗";
};

type LearnedItem = {
  insight: string;
  evidence: string;
  pattern_key: string | null;
};

type NextItem = {
  idx: number;
  label: string;
  detail: string;
  type: "scale" | "fix" | "launch" | "pause" | "budget";
  ad_id: number | null;
  source_action_id: string | null;
  source_decision_id: number | null;
};

type ReviewRow = {
  id: number;
  client_id: number;
  period_label: string;
  period_type: string;
  period_start: string;
  period_end: string;
  status: string;
  headline: string | null;
  subhead: string | null;
  what_happened: string | null;
  what_improved: ImprovementCard[] | null;
  what_we_tested: TestItem[] | null;
  what_we_learned: LearnedItem[] | null;
  what_we_did: { action: string; ad_name: string; outcome: string }[] | null;
  what_next: NextItem[] | null;
  metrics_snapshot: Record<string, unknown> | null;
  generated_at: string | null;
};

type Approval = {
  id: number;
  proposal_index: number;
  proposal_label: string;
  proposal_detail: string | null;
  proposal_type: string;
  status: string;
  client_note: string | null;
};

const NEXT_GROUPS: { type: NextItem["type"]; title: string; tone: string }[] = [
  { type: "scale", title: "Scale up", tone: "#166534" },
  { type: "fix", title: "Fix", tone: "#92400e" },
  { type: "launch", title: "Try something new", tone: "#1e40af" },
  { type: "budget", title: "Budget moves", tone: "#52525b" },
  { type: "pause", title: "Pause", tone: "#991b1b" },
];

function directionArrow(d: "up" | "down" | "flat"): string {
  if (d === "up") return "▲";
  if (d === "down") return "▼";
  return "→";
}

function directionColor(
  d: "up" | "down" | "flat",
  metric: string
): string {
  // Lower-is-better metrics flip the colour
  const lowerIsBetter = /cost|cpc|cpa|cpm/i.test(metric);
  if (d === "flat") return "#71717a";
  const good = lowerIsBetter ? d === "down" : d === "up";
  return good ? "#166534" : "#991b1b";
}

function outcomeBadge(outcome: TestItem["outcome"]): {
  bg: string;
  fg: string;
} {
  if (outcome === "positive") return { bg: "#dcfce7", fg: "#166534" };
  if (outcome === "negative") return { bg: "#fee2e2", fg: "#991b1b" };
  return { bg: "#f4f4f5", fg: "#52525b" };
}

export default async function ReviewDetailPage({
  params,
}: {
  params: Promise<{ clientId: string; reviewId: string }>;
}) {
  const { clientId, reviewId } = await params;
  const supabase = await createClient();

  const [clientRes, reviewRes, approvalsRes] = await Promise.all([
    supabase.from("clients").select("id, name").eq("id", clientId).single(),
    supabase
      .from("reviews")
      .select("*")
      .eq("id", reviewId)
      .eq("client_id", clientId)
      .single(),
    supabase
      .from("review_approvals")
      .select(
        "id, proposal_index, proposal_label, proposal_detail, proposal_type, status, client_note"
      )
      .eq("review_id", reviewId)
      .order("proposal_index", { ascending: true }),
  ]);

  if (clientRes.error || !clientRes.data) {
    return (
      <EmptyState
        title="Client not found"
        description="This client does not exist or has been removed."
      />
    );
  }
  if (reviewRes.error || !reviewRes.data) {
    return (
      <EmptyState
        title="Review not found"
        description="This review does not exist for this client."
      />
    );
  }

  const client = clientRes.data;
  const review = reviewRes.data as ReviewRow;
  const approvals = (approvalsRes.data ?? []) as Approval[];

  const improvements = review.what_improved ?? [];
  const tested = review.what_we_tested ?? [];
  const learned = review.what_we_learned ?? [];
  const next = review.what_next ?? [];

  // Group approvals by proposal_type for the "What's next" section
  const approvalsByType = new Map<string, Approval[]>();
  for (const a of approvals) {
    const list = approvalsByType.get(a.proposal_type) ?? [];
    list.push(a);
    approvalsByType.set(a.proposal_type, list);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Breadcrumb */}
      <div style={{ fontSize: 13, color: "#71717a" }}>
        <Link
          href={`/app/clients/${clientId}`}
          style={{ color: "#71717a", textDecoration: "none" }}
        >
          {client.name}
        </Link>{" "}
        ›{" "}
        <Link
          href={`/app/clients/${clientId}/reviews`}
          style={{ color: "#71717a", textDecoration: "none" }}
        >
          Reviews
        </Link>{" "}
        › <span style={{ color: "#18181b" }}>{review.period_label}</span>
      </div>

      {/* Cover block */}
      <div
        style={{
          background: "linear-gradient(135deg,#18181b,#27272a)",
          color: "#fff",
          borderRadius: 16,
          padding: "28px 28px 32px",
        }}
      >
        <div
          style={{
            fontSize: 12,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            color: "#a1a1aa",
            marginBottom: 8,
          }}
        >
          {review.period_label} · {review.period_type}
        </div>
        <h1
          style={{
            fontSize: 32,
            fontWeight: 700,
            margin: 0,
            lineHeight: 1.15,
          }}
        >
          {review.headline ?? "Review"}
        </h1>
        {review.subhead && (
          <p
            style={{
              margin: "12px 0 0",
              fontSize: 16,
              color: "#e4e4e7",
              lineHeight: 1.5,
              maxWidth: 700,
            }}
          >
            {review.subhead}
          </p>
        )}
        <div
          style={{
            marginTop: 18,
            fontSize: 12,
            color: "#71717a",
          }}
        >
          Generated{" "}
          {review.generated_at
            ? new Date(review.generated_at).toLocaleString()
            : "—"}
        </div>
      </div>

      {/* What happened */}
      <SectionCard title="What happened">
        <p
          style={{
            margin: 0,
            fontSize: 15,
            color: "#27272a",
            lineHeight: 1.6,
          }}
        >
          {review.what_happened ?? "No summary available."}
        </p>
      </SectionCard>

      {/* What improved */}
      <SectionCard title="What improved">
        {improvements.length === 0 ? (
          <EmptyState
            title="Nothing measurable yet"
            description="Once we have a prior period to compare against, deltas will show up here."
          />
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 12,
            }}
          >
            {improvements.map((card, i) => {
              const color = directionColor(card.direction, card.metric);
              return (
                <div
                  key={i}
                  style={{
                    border: "1px solid #e4e4e7",
                    borderRadius: 12,
                    padding: 14,
                    background: "#fafafa",
                  }}
                >
                  <div
                    style={{
                      fontSize: 12,
                      color: "#71717a",
                      textTransform: "uppercase",
                      letterSpacing: "0.04em",
                    }}
                  >
                    {card.metric}
                  </div>
                  <div
                    style={{
                      marginTop: 6,
                      display: "flex",
                      alignItems: "baseline",
                      gap: 8,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 20,
                        fontWeight: 700,
                        color: "#18181b",
                      }}
                    >
                      {card.after}
                    </span>
                    <span style={{ fontSize: 12, color: "#a1a1aa" }}>
                      from {card.before}
                    </span>
                  </div>
                  <div
                    style={{
                      marginTop: 6,
                      fontSize: 13,
                      color,
                      fontWeight: 600,
                    }}
                  >
                    {directionArrow(card.direction)}{" "}
                    {Math.abs(card.delta_pct).toFixed(1)}% · {card.layman}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>

      {/* What we tested */}
      <SectionCard title="What we tested">
        {tested.length === 0 ? (
          <EmptyState
            title="Nothing to report"
            description="No completed experiments landed in this window."
          />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {tested.map((t, i) => {
              const badge = outcomeBadge(t.outcome);
              return (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 12,
                    padding: 12,
                    border: "1px solid #f4f4f5",
                    borderRadius: 10,
                    background: "#fff",
                  }}
                >
                  <span
                    style={{
                      fontSize: 16,
                      lineHeight: 1,
                      width: 22,
                      textAlign: "center",
                      color: badge.fg,
                    }}
                  >
                    {t.symbol}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 600,
                        color: "#18181b",
                      }}
                    >
                      {t.ad_name}
                    </div>
                    {t.hypothesis && (
                      <div
                        style={{
                          fontSize: 13,
                          color: "#52525b",
                          marginTop: 2,
                        }}
                      >
                        {t.hypothesis}
                      </div>
                    )}
                    {t.result && (
                      <div
                        style={{
                          fontSize: 12,
                          color: "#71717a",
                          marginTop: 4,
                          fontStyle: "italic",
                        }}
                      >
                        {t.result}
                      </div>
                    )}
                  </div>
                  <span
                    style={{
                      padding: "3px 10px",
                      borderRadius: 999,
                      background: badge.bg,
                      color: badge.fg,
                      fontSize: 11,
                      fontWeight: 600,
                      textTransform: "capitalize",
                    }}
                  >
                    {t.outcome}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>

      {/* What we learned */}
      <SectionCard title="What we learned">
        {learned.length === 0 ? (
          <EmptyState
            title="No new insights this period"
            description="As we run more tests, patterns from across all clients will surface here."
          />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {learned.map((l, i) => (
              <div
                key={i}
                style={{
                  borderLeft: "3px solid #18181b",
                  paddingLeft: 14,
                  paddingTop: 4,
                  paddingBottom: 4,
                }}
              >
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: "#18181b",
                  }}
                >
                  {l.insight}
                </div>
                <div
                  style={{
                    fontSize: 13,
                    color: "#52525b",
                    marginTop: 4,
                    lineHeight: 1.5,
                  }}
                >
                  {l.evidence}
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* What we're doing next */}
      <SectionCard title="What we're doing next">
        {next.length === 0 ? (
          <EmptyState
            title="No proposed moves"
            description="When the engine suggests next steps they will appear here for approval."
          />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <p
              style={{
                margin: 0,
                fontSize: 13,
                color: "#71717a",
                lineHeight: 1.5,
              }}
            >
              Tick what you&rsquo;re happy with. Approvals will be wired into
              the action engine in the next step.
            </p>
            {NEXT_GROUPS.map((group) => {
              const items = next.filter((n) => n.type === group.type);
              if (items.length === 0) return null;
              const groupApprovals = approvalsByType.get(group.type) ?? [];
              return (
                <div key={group.type}>
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: group.tone,
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      marginBottom: 8,
                    }}
                  >
                    {group.title}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                    }}
                  >
                    {items.map((item) => {
                      const approval = groupApprovals.find(
                        (a) => a.proposal_index === item.idx
                      );
                      const isApproved = approval?.status === "approved";
                      return (
                        <label
                          key={item.idx}
                          style={{
                            display: "flex",
                            alignItems: "flex-start",
                            gap: 12,
                            padding: 12,
                            border: "1px solid #e4e4e7",
                            borderRadius: 10,
                            background: isApproved ? "#f0fdf4" : "#fff",
                            cursor: "default",
                          }}
                        >
                          <input
                            type="checkbox"
                            defaultChecked={isApproved}
                            disabled
                            style={{
                              marginTop: 3,
                              width: 16,
                              height: 16,
                            }}
                          />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div
                              style={{
                                fontSize: 14,
                                fontWeight: 600,
                                color: "#18181b",
                              }}
                            >
                              {item.label}
                            </div>
                            {item.detail && (
                              <div
                                style={{
                                  fontSize: 13,
                                  color: "#52525b",
                                  marginTop: 4,
                                  lineHeight: 1.5,
                                }}
                              >
                                {item.detail}
                              </div>
                            )}
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>

      {/* Footer */}
      <div
        style={{
          fontSize: 12,
          color: "#a1a1aa",
          textAlign: "center",
          padding: "8px 0 24px",
        }}
      >
        This review is in {review.status}. Sharing and approval wiring come in
        the next step.
      </div>
    </div>
  );
}
