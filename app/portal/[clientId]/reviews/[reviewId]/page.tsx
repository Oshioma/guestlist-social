// ---------------------------------------------------------------------------
// /portal/[clientId]/reviews/[reviewId] — read-only review detail.
//
// Strict mirror of the admin review page's *content* — same cover block,
// same five sections (what happened / improved / tested / learned / next) —
// but with every editing affordance removed:
//
//   - No EditableNarrativeField wrappers (the operator's edit surface)
//   - No ReviewLifecycleControls (send / mark approved buttons)
//   - No RewriteWithAIButton
//   - No per-proposal Approve / Decline rows (the public share view at /r/[token]
//     still has them — that's the client-action surface — but the portal sticks
//     to "read"; if a client wants to act, they use the share link they were
//     emailed).
//
// Drafts are hidden from the list, but we still 404 here if someone deep-links
// to a draft id, so the URL space stays consistent.
// ---------------------------------------------------------------------------

import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { canViewClient, getViewer } from "../../../../admin-panel/lib/viewer";

export const dynamic = "force-dynamic";

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
  operator_note?: string | null;
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
};

type ReviewRow = {
  id: number;
  client_id: number;
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
  approved_at: string | null;
};

const NEXT_GROUPS: { type: NextItem["type"]; title: string; tone: string }[] = [
  { type: "scale", title: "Scale up", tone: "#166534" },
  { type: "fix", title: "Fix", tone: "#92400e" },
  { type: "launch", title: "Try something new", tone: "#1e40af" },
  { type: "budget", title: "Budget moves", tone: "#475569" },
  { type: "pause", title: "Pause", tone: "#991b1b" },
];

function directionArrow(d: "up" | "down" | "flat"): string {
  if (d === "up") return "▲";
  if (d === "down") return "▼";
  return "→";
}

function directionColor(d: "up" | "down" | "flat", metric: string): string {
  const lowerIsBetter = /cost|cpc|cpa|cpm/i.test(metric);
  if (d === "flat") return "#64748b";
  const good = lowerIsBetter ? d === "down" : d === "up";
  return good ? "#166534" : "#991b1b";
}

function outcomeBadge(outcome: TestItem["outcome"]): { bg: string; fg: string } {
  if (outcome === "positive") return { bg: "#dcfce7", fg: "#166534" };
  if (outcome === "negative") return { bg: "#fee2e2", fg: "#991b1b" };
  return { bg: "#f1f5f9", fg: "#475569" };
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      style={{
        background: "#fff",
        border: "1px solid #e2e8f0",
        borderRadius: 12,
        padding: 24,
      }}
    >
      <h2 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 16px", color: "#0f172a" }}>
        {title}
      </h2>
      {children}
    </section>
  );
}

export default async function PortalReviewDetailPage({
  params,
}: {
  params: Promise<{ clientId: string; reviewId: string }>;
}) {
  const { clientId: rawClientId, reviewId } = await params;
  const clientId = Number(rawClientId);

  const viewer = await getViewer();
  if (!canViewClient(viewer, clientId)) notFound();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("reviews")
    .select(
      "id, client_id, period_label, period_type, status, headline, subhead, what_happened, what_improved, what_we_tested, what_we_learned, what_next, generated_at, sent_at, approved_at"
    )
    .eq("id", reviewId)
    .eq("client_id", clientId)
    .single();

  if (error || !data) notFound();

  const review = data as ReviewRow;

  // Drafts never show in the portal — even via deep link.
  if (review.status === "draft") notFound();

  const improvements = review.what_improved ?? [];
  const tested = review.what_we_tested ?? [];
  const learned = review.what_we_learned ?? [];
  const next = review.what_next ?? [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Breadcrumb */}
      <div>
        <Link
          href={`/portal/${clientId}/reviews`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 13,
            color: "#64748b",
            textDecoration: "none",
          }}
        >
          ← All reviews
        </Link>
      </div>

      {/* Cover block */}
      <div
        style={{
          background: "linear-gradient(135deg,#0f172a,#1e293b)",
          color: "#fff",
          borderRadius: 16,
          padding: "32px 32px 36px",
        }}
      >
        <div
          style={{
            fontSize: 12,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            color: "#94a3b8",
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
              margin: "14px 0 0",
              fontSize: 16,
              color: "#cbd5e1",
              lineHeight: 1.5,
              maxWidth: 680,
            }}
          >
            {review.subhead}
          </p>
        )}
        <div style={{ marginTop: 20, fontSize: 12, color: "#94a3b8" }}>
          {review.status === "approved" && review.approved_at
            ? `Approved ${new Date(review.approved_at).toLocaleDateString()}`
            : review.sent_at
            ? `Sent ${new Date(review.sent_at).toLocaleDateString()}`
            : null}
        </div>
      </div>

      {/* What happened */}
      <Section title="What happened">
        <p
          style={{
            margin: 0,
            fontSize: 15,
            color: "#0f172a",
            lineHeight: 1.6,
            whiteSpace: "pre-wrap",
          }}
        >
          {review.what_happened ?? "No summary available."}
        </p>
      </Section>

      {/* What improved */}
      <Section title="What improved">
        {improvements.length === 0 ? (
          <div style={{ fontSize: 13, color: "#94a3b8" }}>
            Nothing measurable yet for this period.
          </div>
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
                    border: "1px solid #e2e8f0",
                    borderRadius: 12,
                    padding: 16,
                    background: "#f8fafc",
                  }}
                >
                  <div
                    style={{
                      fontSize: 11,
                      color: "#64748b",
                      textTransform: "uppercase",
                      letterSpacing: "0.04em",
                    }}
                  >
                    {card.metric}
                  </div>
                  <div style={{ marginTop: 8, display: "flex", alignItems: "baseline", gap: 8 }}>
                    <span style={{ fontSize: 22, fontWeight: 700, color: "#0f172a" }}>
                      {card.after}
                    </span>
                    <span style={{ fontSize: 12, color: "#94a3b8" }}>
                      from {card.before}
                    </span>
                  </div>
                  <div
                    style={{
                      marginTop: 8,
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
      </Section>

      {/* What we tested */}
      <Section title="What we tested">
        {tested.length === 0 ? (
          <div style={{ fontSize: 13, color: "#94a3b8" }}>
            No completed experiments landed in this window.
          </div>
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
                    padding: 14,
                    border: "1px solid #e2e8f0",
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
                    <div style={{ fontSize: 14, fontWeight: 600, color: "#0f172a" }}>
                      {t.ad_name}
                    </div>
                    {t.hypothesis && (
                      <div style={{ fontSize: 13, color: "#475569", marginTop: 2 }}>
                        {t.hypothesis}
                      </div>
                    )}
                    {t.result && (
                      <div
                        style={{
                          fontSize: 12,
                          color: "#64748b",
                          marginTop: 4,
                          fontStyle: "italic",
                        }}
                      >
                        {t.result}
                      </div>
                    )}
                    {t.operator_note && (
                      <div
                        style={{
                          marginTop: 6,
                          padding: "6px 10px",
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
                        {t.operator_note}
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
      </Section>

      {/* What we learned */}
      <Section title="What we learned">
        {learned.length === 0 ? (
          <div style={{ fontSize: 13, color: "#94a3b8" }}>
            No new insights this period.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {learned.map((l, i) => (
              <div
                key={i}
                style={{
                  borderLeft: "3px solid #0f172a",
                  paddingLeft: 14,
                  paddingTop: 4,
                  paddingBottom: 4,
                }}
              >
                <div style={{ fontSize: 14, fontWeight: 600, color: "#0f172a" }}>
                  {l.insight}
                </div>
                <div
                  style={{
                    fontSize: 13,
                    color: "#475569",
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
      </Section>

      {/* What we're doing next */}
      <Section title="What we're doing next">
        {next.length === 0 ? (
          <div style={{ fontSize: 13, color: "#94a3b8" }}>
            No proposed moves for this period.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {NEXT_GROUPS.map((group) => {
              const items = next.filter((n) => n.type === group.type);
              if (items.length === 0) return null;
              return (
                <div key={group.type}>
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: group.tone,
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      marginBottom: 8,
                    }}
                  >
                    {group.title}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {items.map((item) => (
                      <div
                        key={item.idx}
                        style={{
                          padding: 14,
                          background: "#f8fafc",
                          border: "1px solid #e2e8f0",
                          borderRadius: 10,
                        }}
                      >
                        <div style={{ fontSize: 14, fontWeight: 600, color: "#0f172a" }}>
                          {item.label}
                        </div>
                        {item.detail && (
                          <div style={{ marginTop: 4, fontSize: 13, color: "#475569", lineHeight: 1.5 }}>
                            {item.detail}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Section>
    </div>
  );
}
