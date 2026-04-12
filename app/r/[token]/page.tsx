import { createClient } from "@supabase/supabase-js";
import ReviewApprovalRow from "../../admin-panel/components/ReviewApprovalRow";
import { approveProposalByShareToken } from "../../admin-panel/lib/review-actions";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Public client-facing share view of a review.
//
// The share token is the auth: anyone with the link can read the review and
// approve / decline the proposed next steps. No login, no admin chrome.
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

type Approval = {
  id: number;
  proposal_index: number;
  proposal_label: string;
  proposal_detail: string | null;
  proposal_type: string;
  status: "pending" | "approved" | "declined" | "changed";
  client_note: string | null;
};

const NEXT_GROUPS: { type: NextItem["type"]; title: string; tone: string }[] = [
  { type: "scale", title: "Scale up", tone: "#166534" },
  { type: "fix", title: "Fix", tone: "#92400e" },
  { type: "launch", title: "Try something new", tone: "#1e40af" },
  { type: "budget", title: "Budget moves", tone: "#52525b" },
  { type: "pause", title: "Pause", tone: "#991b1b" },
];

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env vars");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function directionArrow(d: "up" | "down" | "flat"): string {
  if (d === "up") return "▲";
  if (d === "down") return "▼";
  return "→";
}

function directionColor(
  d: "up" | "down" | "flat",
  metric: string
): string {
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

export default async function PublicReviewPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = admin();

  const { data: reviewRow, error } = await supabase
    .from("reviews")
    .select("*, clients(name)")
    .eq("share_token", token)
    .single();

  if (error || !reviewRow) {
    return (
      <div
        style={{
          maxWidth: 560,
          margin: "120px auto",
          padding: 32,
          textAlign: "center",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <h1 style={{ fontSize: 22, margin: "0 0 8px" }}>Link expired</h1>
        <p style={{ fontSize: 14, color: "#71717a", margin: 0 }}>
          This review link is no longer valid. Ask your account manager for
          a fresh one.
        </p>
      </div>
    );
  }

  const review = reviewRow as {
    id: number;
    period_label: string;
    period_type: string;
    status: string;
    headline: string | null;
    subhead: string | null;
    what_happened: string | null;
    what_improved: ImprovementCard[] | null;
    what_we_tested: TestItem[] | null;
    what_we_learned: LearnedItem[] | null;
    what_next: NextItem[] | null;
    generated_at: string | null;
    sent_at: string | null;
    clients: { name: string } | { name: string }[] | null;
  };

  const clientName = Array.isArray(review.clients)
    ? review.clients[0]?.name
    : review.clients?.name;

  const { data: approvalRows } = await supabase
    .from("review_approvals")
    .select(
      "id, proposal_index, proposal_label, proposal_detail, proposal_type, status, client_note"
    )
    .eq("review_id", review.id)
    .order("proposal_index", { ascending: true });

  const approvals = (approvalRows ?? []) as Approval[];
  const approvalsByType = new Map<string, Approval[]>();
  for (const a of approvals) {
    const list = approvalsByType.get(a.proposal_type) ?? [];
    list.push(a);
    approvalsByType.set(a.proposal_type, list);
  }

  const improvements = review.what_improved ?? [];
  const tested = review.what_we_tested ?? [];
  const learned = review.what_we_learned ?? [];
  const next = review.what_next ?? [];

  return (
    <div
      style={{
        background: "#fafafa",
        minHeight: "100vh",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <div
        style={{
          maxWidth: 760,
          margin: "0 auto",
          padding: "32px 24px 80px",
          display: "flex",
          flexDirection: "column",
          gap: 24,
        }}
      >
        {/* Cover block */}
        <div
          style={{
            background: "linear-gradient(135deg,#18181b,#27272a)",
            color: "#fff",
            borderRadius: 16,
            padding: "32px 32px 36px",
          }}
        >
          {clientName && (
            <div
              style={{
                fontSize: 12,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                color: "#a1a1aa",
                marginBottom: 4,
              }}
            >
              {clientName}
            </div>
          )}
          <div
            style={{
              fontSize: 12,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              color: "#a1a1aa",
              marginBottom: 10,
            }}
          >
            {review.period_label}
          </div>
          <h1
            style={{
              fontSize: 34,
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
                margin: "14px 0 0",
                fontSize: 17,
                color: "#e4e4e7",
                lineHeight: 1.5,
                maxWidth: 640,
              }}
            >
              {review.subhead}
            </p>
          )}
        </div>

        {/* What happened */}
        <Card title="What happened">
          <p
            style={{
              margin: 0,
              fontSize: 15,
              color: "#27272a",
              lineHeight: 1.6,
            }}
          >
            {review.what_happened ?? "No summary."}
          </p>
        </Card>

        {/* What improved */}
        {improvements.length > 0 && (
          <Card title="What improved">
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
          </Card>
        )}

        {/* What we tested */}
        {tested.length > 0 && (
          <Card title="What we tested">
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
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {/* What we learned */}
        {learned.length > 0 && (
          <Card title="What we learned">
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {learned.map((l, i) => (
                <div
                  key={i}
                  style={{
                    borderLeft: "3px solid #18181b",
                    paddingLeft: 14,
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
          </Card>
        )}

        {/* What's next */}
        {next.length > 0 && (
          <Card title="What we're doing next">
            <p
              style={{
                margin: "0 0 16px",
                fontSize: 13,
                color: "#71717a",
                lineHeight: 1.5,
              }}
            >
              Approve what you&rsquo;re happy with — we&rsquo;ll get going on
              it straight away.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
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
                        if (!approval) return null;
                        return (
                          <ReviewApprovalRow
                            key={approval.id}
                            approvalId={approval.id}
                            label={item.label}
                            detail={item.detail}
                            status={approval.status}
                            onDecide={async (
                              id: number,
                              decision: "approved" | "declined"
                            ) => {
                              "use server";
                              await approveProposalByShareToken(
                                token,
                                id,
                                decision
                              );
                            }}
                          />
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        <div
          style={{
            fontSize: 12,
            color: "#a1a1aa",
            textAlign: "center",
            marginTop: 8,
          }}
        >
          Sent{" "}
          {review.sent_at
            ? new Date(review.sent_at).toLocaleDateString()
            : "—"}
          {" · "}Guestlist Social
        </div>
      </div>
    </div>
  );
}

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e4e4e7",
        borderRadius: 14,
        padding: 22,
      }}
    >
      <h2 style={{ fontSize: 15, fontWeight: 600, margin: "0 0 14px" }}>
        {title}
      </h2>
      {children}
    </div>
  );
}
