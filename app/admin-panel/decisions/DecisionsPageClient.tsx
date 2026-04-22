"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type DecisionType = "pause" | "scale" | "test" | "hold";
type Confidence = "LOW" | "MEDIUM" | "HIGH";
type Outcome = "positive" | "neutral" | "negative";

export type DecisionCardData = {
  id: string;
  adName: string;
  campaignName: string;
  type: DecisionType;
  reason: string;
  insight: string;
  ctr: number;
  cpc: number;
  spend: number;
  conversions: number;
  confidence: Confidence;
  thumbnail?: string | null;
  impact: string;
  liveStatus: string;
  budgetPerDay: number | null;
  ageLabel: string;
  state:
    | "needs_review"
    | "ready_to_execute"
    | "awaiting_outcome"
    | "completed";
  queueHref: string;
  adHref: string | null;
};

export type ResultItem = {
  id: string;
  adName: string;
  action: string;
  outcome: Outcome;
  summary: string;
};

export type DecisionsPageModel = {
  title: string;
  syncedLabel: string;
  autoMode: {
    enabled: boolean;
    description: string;
    allowedActions: string;
    creativePolicy: string;
    last7AutoApproved: number;
    rejectedRecent: number;
  };
  trust: {
    accuracy: number;
    completedCount: number;
    bestAt: string;
    strong: string;
    needsWork: string;
  };
  summary: {
    needsReview: number;
    executedToday: number;
    awaitingOutcome: number;
    accuracy: number;
  };
  decisions: DecisionCardData[];
  results: ResultItem[];
};

const FILTERS = [
  { key: "all", label: "All" },
  { key: "needs_review", label: "Needs review" },
  { key: "ready_to_execute", label: "Ready" },
  { key: "awaiting_outcome", label: "Awaiting outcome" },
  { key: "completed", label: "Completed" },
] as const;

function formatCurrency(value: number) {
  return `£${value.toFixed(value % 1 === 0 ? 0 : 2)}`;
}

function typeConfig(type: DecisionType) {
  switch (type) {
    case "pause":
      return {
        badge: "Pause",
        accent: "#b42318",
        soft: "#fef3f2",
        border: "#fecdca",
        action: "Pause Ad",
      };
    case "scale":
      return {
        badge: "Scale",
        accent: "#067647",
        soft: "#ecfdf3",
        border: "#abefc6",
        action: "Increase Budget +20%",
      };
    case "test":
      return {
        badge: "Test",
        accent: "#6941c6",
        soft: "#f9f5ff",
        border: "#e9d7fe",
        action: "Generate New Variant",
      };
    case "hold":
      return {
        badge: "Hold",
        accent: "#475467",
        soft: "#f8fafc",
        border: "#d0d5dd",
        action: "Keep Watching",
      };
    default:
      return {
        badge: "Decision",
        accent: "#344054",
        soft: "#f8fafc",
        border: "#d0d5dd",
        action: "Review",
      };
  }
}

function confidenceStyle(confidence: Confidence) {
  if (confidence === "HIGH") {
    return { color: "#067647", background: "#ecfdf3", border: "#abefc6" };
  }
  if (confidence === "MEDIUM") {
    return { color: "#b54708", background: "#fffaeb", border: "#fedf89" };
  }
  return { color: "#b42318", background: "#fef3f2", border: "#fecdca" };
}

function outcomeStyle(outcome: Outcome) {
  if (outcome === "positive") {
    return {
      label: "Positive",
      color: "#067647",
      background: "#ecfdf3",
      border: "#abefc6",
    };
  }
  if (outcome === "negative") {
    return {
      label: "Negative",
      color: "#b42318",
      background: "#fef3f2",
      border: "#fecdca",
    };
  }
  return {
    label: "Neutral",
    color: "#475467",
    background: "#f2f4f7",
    border: "#d0d5dd",
  };
}

export default function DecisionsPageClient({ model }: { model: DecisionsPageModel }) {
  const [selectedFilter, setSelectedFilter] =
    useState<(typeof FILTERS)[number]["key"]>("all");
  const [selectedDecision, setSelectedDecision] =
    useState<DecisionCardData | null>(null);

  const filteredDecisions = useMemo(() => {
    if (selectedFilter === "all") return model.decisions;
    return model.decisions.filter((decision) => decision.state === selectedFilter);
  }, [model.decisions, selectedFilter]);

  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "linear-gradient(180deg, #f6f7f8 0%, #f1f3f5 45%, #eef1f4 100%)",
        color: "#101828",
      }}
    >
      <div
        style={{
          maxWidth: 1520,
          margin: "0 auto",
          padding: "24px 20px 40px",
        }}
      >
        <TopBar
          title={model.title}
          syncedLabel={model.syncedLabel}
          autoMode={model.autoMode}
        />
        <SummaryStrip
          needsReview={model.summary.needsReview}
          executedToday={model.summary.executedToday}
          awaitingOutcome={model.summary.awaitingOutcome}
          accuracy={model.summary.accuracy}
        />
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1.65fr) minmax(320px, 0.75fr)",
            gap: 20,
            alignItems: "start",
          }}
        >
          <section
            style={{
              minWidth: 0,
              border: "1px solid rgba(16, 24, 40, 0.06)",
              background: "rgba(255,255,255,0.72)",
              backdropFilter: "blur(10px)",
              borderRadius: 24,
              boxShadow: "0 12px 30px rgba(16, 24, 40, 0.06)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "18px 18px 14px",
                borderBottom: "1px solid rgba(16,24,40,0.06)",
                background:
                  "linear-gradient(180deg, rgba(255,255,255,0.9), rgba(250,250,251,0.76))",
              }}
            >
              <div
                style={{
                  display: "flex",
                  gap: 12,
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: 20,
                      fontWeight: 700,
                      letterSpacing: "-0.02em",
                    }}
                  >
                    Decisions
                  </div>
                  <div
                    style={{
                      marginTop: 4,
                      fontSize: 14,
                      color: "#667085",
                    }}
                  >
                    Clear the next best actions for this account.
                  </div>
                </div>
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    flexWrap: "wrap",
                  }}
                >
                  {FILTERS.map((filter) => {
                    const active = selectedFilter === filter.key;
                    return (
                      <button
                        key={filter.key}
                        onClick={() => setSelectedFilter(filter.key)}
                        style={{
                          borderRadius: 999,
                          border: active
                            ? "1px solid rgba(16,24,40,0.12)"
                            : "1px solid rgba(16,24,40,0.08)",
                          background: active
                            ? "#ffffff"
                            : "rgba(255,255,255,0.5)",
                          color: active ? "#101828" : "#475467",
                          padding: "10px 14px",
                          fontSize: 13,
                          fontWeight: 600,
                          cursor: "pointer",
                          boxShadow: active
                            ? "0 2px 10px rgba(16,24,40,0.06)"
                            : "none",
                        }}
                      >
                        {filter.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            <div
              style={{
                padding: 18,
                display: "grid",
                gap: 14,
              }}
            >
              {filteredDecisions.length === 0 ? (
                <div
                  style={{
                    borderRadius: 20,
                    border: "1px dashed rgba(16,24,40,0.12)",
                    background: "rgba(255,255,255,0.6)",
                    padding: 28,
                    textAlign: "center",
                    color: "#667085",
                  }}
                >
                  No decisions in this state right now.
                </div>
              ) : (
                filteredDecisions.map((decision) => (
                  <DecisionCard
                    key={decision.id}
                    decision={decision}
                    onOpen={() => setSelectedDecision(decision)}
                  />
                ))
              )}
            </div>
          </section>
          <aside
            style={{
              minWidth: 0,
              display: "grid",
              gap: 16,
              position: "sticky",
              top: 20,
            }}
          >
            <SideCard
              title="Auto Mode"
              subtitle="High-confidence decisions can be greenlit faster."
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  marginBottom: 14,
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: 26,
                      fontWeight: 700,
                      letterSpacing: "-0.03em",
                    }}
                  >
                    {model.autoMode.enabled ? "ON" : "OFF"}
                  </div>
                  <div style={{ fontSize: 13, color: "#667085", marginTop: 4 }}>
                    {model.autoMode.description}
                  </div>
                </div>
                <span
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: "50%",
                    background: model.autoMode.enabled ? "#12b76a" : "#98a2b3",
                    boxShadow: model.autoMode.enabled
                      ? "0 0 0 4px rgba(18, 183, 106, 0.12)"
                      : "none",
                  }}
                />
              </div>
              <div style={{ display: "grid", gap: 10 }}>
                <RuleRow
                  label="Allowed actions"
                  value={model.autoMode.allowedActions}
                />
                <RuleRow
                  label="Creative changes"
                  value={model.autoMode.creativePolicy}
                />
                <RuleRow
                  label="Last 7 days"
                  value={`${model.autoMode.last7AutoApproved} auto-approved`}
                />
                <RuleRow
                  label="Rejected"
                  value={`${model.autoMode.rejectedRecent} recently rejected`}
                />
              </div>
              <Link href="/app/settings" style={secondaryLinkStyle}>
                Edit rules
              </Link>
            </SideCard>
            <SideCard
              title="Engine Trust"
              subtitle="Simple proof that the engine is actually helping."
            >
              <div
                style={{
                  fontSize: 34,
                  fontWeight: 800,
                  lineHeight: 1,
                  letterSpacing: "-0.04em",
                }}
              >
                {model.trust.accuracy}%
              </div>
              <div style={{ fontSize: 13, color: "#667085", marginTop: 8 }}>
                Accuracy across {model.trust.completedCount} completed decisions
              </div>
              <div style={{ display: "grid", gap: 10, marginTop: 16 }}>
                <TrustRow label="Best at" value={model.trust.bestAt} />
                <TrustRow label="Strong" value={model.trust.strong} />
                <TrustRow label="Needs work" value={model.trust.needsWork} />
              </div>
            </SideCard>
            <SideCard
              title="Recent Outcomes"
              subtitle="7-day feedback loop on past actions."
            >
              <div style={{ display: "grid", gap: 12 }}>
                {model.results.length === 0 ? (
                  <div style={{ fontSize: 13, color: "#667085" }}>
                    No measured outcomes yet.
                  </div>
                ) : (
                  model.results.map((result) => (
                    <OutcomeRow key={result.id} item={result} />
                  ))
                )}
              </div>
            </SideCard>
          </aside>
        </div>
      </div>
      {selectedDecision ? (
        <DecisionDrawer
          decision={selectedDecision}
          onClose={() => setSelectedDecision(null)}
        />
      ) : null}
    </div>
  );
}

function TopBar({
  title,
  syncedLabel,
  autoMode,
}: {
  title: string;
  syncedLabel: string;
  autoMode: DecisionsPageModel["autoMode"];
}) {
  return (
    <div
      style={{
        borderRadius: 24,
        border: "1px solid rgba(16,24,40,0.06)",
        background: "rgba(255,255,255,0.72)",
        backdropFilter: "blur(10px)",
        boxShadow: "0 12px 30px rgba(16, 24, 40, 0.06)",
        padding: "16px 18px",
        marginBottom: 16,
      }}
    >
      <div
        style={{
          display: "flex",
          gap: 16,
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 22,
              fontWeight: 700,
              letterSpacing: "-0.03em",
            }}
          >
            {title}
          </div>
          <div
            style={{
              marginTop: 4,
              fontSize: 14,
              color: "#667085",
              overflowWrap: "anywhere",
            }}
          >
            Meta decision layer • {syncedLabel}
          </div>
        </div>
        <div
          style={{
            display: "flex",
            gap: 10,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <Link href="/app/engine" style={primaryLinkStyle}>
            Score Ads
          </Link>
          <Link
            href="/app/settings"
            style={{
              ...secondaryLinkStyle,
              display: "inline-flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: autoMode.enabled ? "#12b76a" : "#98a2b3",
                boxShadow: autoMode.enabled
                  ? "0 0 0 4px rgba(18, 183, 106, 0.12)"
                  : "none",
              }}
            />
            Auto Mode: {autoMode.enabled ? "ON" : "OFF"}
          </Link>
          <Link
            href="/app/settings"
            style={{
              ...secondaryLinkStyle,
              width: 42,
              height: 42,
              padding: 0,
              fontSize: 18,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            aria-label="Settings"
          >
            ⚙
          </Link>
        </div>
      </div>
    </div>
  );
}

function SummaryStrip({
  needsReview,
  executedToday,
  awaitingOutcome,
  accuracy,
}: {
  needsReview: number;
  executedToday: number;
  awaitingOutcome: number;
  accuracy: number;
}) {
  const items = [
    { label: "Need review", value: needsReview },
    { label: "Executed today", value: executedToday },
    { label: "Awaiting outcome", value: awaitingOutcome },
    { label: "Accuracy", value: `${accuracy}%` },
  ];

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
        gap: 12,
        marginBottom: 20,
      }}
    >
      {items.map((item) => (
        <div
          key={item.label}
          style={{
            borderRadius: 20,
            border: "1px solid rgba(16,24,40,0.06)",
            background: "rgba(255,255,255,0.72)",
            backdropFilter: "blur(10px)",
            boxShadow: "0 10px 24px rgba(16, 24, 40, 0.04)",
            padding: "16px 18px",
          }}
        >
          <div
            style={{
              fontSize: 13,
              color: "#667085",
              marginBottom: 8,
            }}
          >
            {item.label}
          </div>
          <div
            style={{
              fontSize: 28,
              lineHeight: 1,
              fontWeight: 800,
              letterSpacing: "-0.04em",
            }}
          >
            {item.value}
          </div>
        </div>
      ))}
    </div>
  );
}

function DecisionCard({
  decision,
  onOpen,
}: {
  decision: DecisionCardData;
  onOpen: () => void;
}) {
  const config = typeConfig(decision.type);
  const confidence = confidenceStyle(decision.confidence);

  return (
    <div
      style={{
        borderRadius: 24,
        border: "1px solid rgba(16,24,40,0.08)",
        background: "#ffffff",
        boxShadow: "0 8px 24px rgba(16,24,40,0.05)",
        overflow: "hidden",
      }}
    >
      <div style={{ padding: 18 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "68px minmax(0, 1fr) auto",
            gap: 14,
            alignItems: "start",
          }}
        >
          <div
            style={{
              width: 68,
              height: 68,
              borderRadius: 18,
              background:
                "linear-gradient(135deg, rgba(16,24,40,0.08), rgba(16,24,40,0.02))",
              border: "1px solid rgba(16,24,40,0.06)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#475467",
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: "0.03em",
              overflow: "hidden",
            }}
          >
            {decision.thumbnail ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={decision.thumbnail}
                alt={decision.adName}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : (
              "AD"
            )}
          </div>
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                display: "flex",
                gap: 10,
                alignItems: "center",
                flexWrap: "wrap",
                marginBottom: 6,
              }}
            >
              <div
                style={{
                  fontSize: 18,
                  fontWeight: 700,
                  letterSpacing: "-0.02em",
                  minWidth: 0,
                  overflowWrap: "anywhere",
                }}
              >
                {decision.adName}
              </div>
              <span
                style={{
                  borderRadius: 999,
                  background: config.soft,
                  color: config.accent,
                  border: `1px solid ${config.border}`,
                  padding: "6px 10px",
                  fontSize: 12,
                  fontWeight: 700,
                  lineHeight: 1,
                }}
              >
                {config.badge}
              </span>
            </div>
            <div
              style={{
                fontSize: 13,
                color: "#667085",
                marginBottom: 10,
                overflowWrap: "anywhere",
              }}
            >
              {decision.campaignName}
            </div>
            <div
              style={{
                fontSize: 15,
                lineHeight: 1.55,
                color: "#344054",
                overflowWrap: "anywhere",
              }}
            >
              {decision.insight}
            </div>
          </div>
          <div
            style={{
              fontSize: 12,
              color: "#98a2b3",
              whiteSpace: "nowrap",
            }}
          >
            {decision.ageLabel}
          </div>
        </div>
        <div
          style={{
            marginTop: 16,
            display: "grid",
            gridTemplateColumns: "repeat(4, minmax(0, 1fr)) auto",
            gap: 10,
            alignItems: "stretch",
          }}
        >
          <MetricPill label="CTR" value={`${decision.ctr}%`} />
          <MetricPill label="CPC" value={formatCurrency(decision.cpc)} />
          <MetricPill label="Spend" value={formatCurrency(decision.spend)} />
          <MetricPill label="Conv" value={String(decision.conversions)} />
          <div
            style={{
              borderRadius: 16,
              border: `1px solid ${confidence.border}`,
              background: confidence.background,
              padding: "10px 12px",
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              minWidth: 110,
            }}
          >
            <span style={{ fontSize: 11, color: "#667085", marginBottom: 4 }}>
              Confidence
            </span>
            <span style={{ fontSize: 13, fontWeight: 700, color: confidence.color }}>
              {decision.confidence}
            </span>
          </div>
        </div>
        <div
          style={{
            marginTop: 16,
            display: "flex",
            gap: 10,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <button
            onClick={onOpen}
            style={{
              borderRadius: 14,
              border: "1px solid rgba(16,24,40,0.08)",
              background: "#101828",
              color: "#ffffff",
              padding: "12px 16px",
              fontSize: 14,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            {config.action}
          </button>
          <Link href={decision.queueHref} style={secondaryLinkStyle}>
            Open queue
          </Link>
          <button
            onClick={onOpen}
            style={{
              border: "none",
              background: "transparent",
              color: "#667085",
              padding: "8px 4px",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            View reasoning
          </button>
        </div>
      </div>
    </div>
  );
}

function MetricPill({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        borderRadius: 16,
        border: "1px solid rgba(16,24,40,0.06)",
        background: "#f8fafc",
        padding: "10px 12px",
      }}
    >
      <div style={{ fontSize: 11, color: "#667085", marginBottom: 4 }}>{label}</div>
      <div
        style={{
          fontSize: 14,
          fontWeight: 700,
          color: "#101828",
          overflowWrap: "anywhere",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function SideCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        borderRadius: 24,
        border: "1px solid rgba(16,24,40,0.06)",
        background: "rgba(255,255,255,0.82)",
        backdropFilter: "blur(10px)",
        boxShadow: "0 10px 28px rgba(16,24,40,0.05)",
        padding: 18,
      }}
    >
      <div style={{ marginBottom: 14 }}>
        <div
          style={{
            fontSize: 17,
            fontWeight: 700,
            letterSpacing: "-0.02em",
          }}
        >
          {title}
        </div>
        <div
          style={{
            fontSize: 13,
            color: "#667085",
            marginTop: 4,
            lineHeight: 1.5,
          }}
        >
          {subtitle}
        </div>
      </div>
      {children}
    </div>
  );
}

function RuleRow({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 12,
        fontSize: 13,
        padding: "10px 0",
        borderBottom: "1px solid rgba(16,24,40,0.06)",
      }}
    >
      <span style={{ color: "#667085" }}>{label}</span>
      <span style={{ fontWeight: 600, color: "#101828", textAlign: "right" }}>
        {value}
      </span>
    </div>
  );
}

function TrustRow({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        borderRadius: 16,
        border: "1px solid rgba(16,24,40,0.06)",
        background: "#f8fafc",
        padding: "12px 14px",
      }}
    >
      <div style={{ fontSize: 12, color: "#667085", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: "#101828" }}>{value}</div>
    </div>
  );
}

function OutcomeRow({ item }: { item: ResultItem }) {
  const style = outcomeStyle(item.outcome);

  return (
    <div
      style={{
        borderRadius: 18,
        border: "1px solid rgba(16,24,40,0.06)",
        background: "#ffffff",
        padding: "14px 14px 12px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          justifyContent: "space-between",
          flexWrap: "wrap",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: "#101828",
              overflowWrap: "anywhere",
            }}
          >
            {item.action}: {item.adName}
          </div>
        </div>
        <span
          style={{
            borderRadius: 999,
            border: `1px solid ${style.border}`,
            background: style.background,
            color: style.color,
            padding: "6px 10px",
            fontSize: 12,
            fontWeight: 700,
          }}
        >
          {style.label}
        </span>
      </div>
      <div
        style={{
          marginTop: 8,
          fontSize: 13,
          color: "#667085",
          lineHeight: 1.55,
          overflowWrap: "anywhere",
        }}
      >
        {item.summary}
      </div>
    </div>
  );
}

function DecisionDrawer({
  decision,
  onClose,
}: {
  decision: DecisionCardData;
  onClose: () => void;
}) {
  const config = typeConfig(decision.type);

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(16,24,40,0.35)",
          zIndex: 50,
        }}
      />
      <div
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          height: "100vh",
          width: "min(520px, 100vw)",
          background: "#ffffff",
          borderLeft: "1px solid rgba(16,24,40,0.08)",
          boxShadow: "-20px 0 40px rgba(16,24,40,0.16)",
          zIndex: 60,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            padding: "18px 18px 16px",
            borderBottom: "1px solid rgba(16,24,40,0.08)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "start",
            gap: 12,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                borderRadius: 999,
                background: config.soft,
                color: config.accent,
                border: `1px solid ${config.border}`,
                padding: "7px 10px",
                fontSize: 12,
                fontWeight: 700,
                marginBottom: 12,
              }}
            >
              {config.badge}
            </div>
            <div
              style={{
                fontSize: 24,
                fontWeight: 800,
                letterSpacing: "-0.04em",
                lineHeight: 1.1,
                overflowWrap: "anywhere",
              }}
            >
              {decision.adName}
            </div>
            <div
              style={{
                fontSize: 14,
                color: "#667085",
                marginTop: 6,
                overflowWrap: "anywhere",
              }}
            >
              {decision.campaignName}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              border: "1px solid rgba(16,24,40,0.08)",
              background: "#ffffff",
              cursor: "pointer",
              fontSize: 18,
            }}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div
          style={{
            padding: 18,
            overflowY: "auto",
            display: "grid",
            gap: 16,
          }}
        >
          <DrawerBlock title="Why this is recommended">{decision.reason}</DrawerBlock>
          <DrawerBlock title="What the engine sees">{decision.insight}</DrawerBlock>
          <DrawerBlock title="Expected impact">{decision.impact}</DrawerBlock>
          <div
            style={{
              borderRadius: 20,
              border: "1px solid rgba(16,24,40,0.06)",
              background: "#f8fafc",
              padding: 16,
            }}
          >
            <div
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: "#101828",
                marginBottom: 12,
              }}
            >
              Live Meta state
            </div>
            <div style={{ display: "grid", gap: 10 }}>
              <DrawerStat label="Current status" value={decision.liveStatus} />
              <DrawerStat
                label="Daily budget"
                value={
                  decision.budgetPerDay != null
                    ? formatCurrency(decision.budgetPerDay)
                    : "Unknown"
                }
              />
              <DrawerStat label="CTR" value={`${decision.ctr}%`} />
              <DrawerStat label="Spend" value={formatCurrency(decision.spend)} />
              <DrawerStat label="Conversions" value={String(decision.conversions)} />
            </div>
          </div>
        </div>
        <div
          style={{
            marginTop: "auto",
            padding: 18,
            borderTop: "1px solid rgba(16,24,40,0.08)",
            background: "#ffffff",
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <Link
            href={decision.queueHref}
            style={{
              ...primaryLinkStyle,
              flex: 1,
              minWidth: 180,
              textAlign: "center",
            }}
          >
            {config.action}
          </Link>
          <Link
            href={decision.adHref ?? "/app/meta-queue"}
            style={{
              ...secondaryLinkStyle,
              flex: 1,
              minWidth: 160,
              textAlign: "center",
            }}
          >
            Open ad
          </Link>
        </div>
      </div>
    </>
  );
}

function DrawerBlock({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        borderRadius: 20,
        border: "1px solid rgba(16,24,40,0.06)",
        background: "#ffffff",
        padding: 16,
      }}
    >
      <div
        style={{
          fontSize: 14,
          fontWeight: 700,
          color: "#101828",
          marginBottom: 8,
        }}
      >
        {title}
      </div>
      <div
        style={{
          fontSize: 14,
          lineHeight: 1.65,
          color: "#475467",
          overflowWrap: "anywhere",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function DrawerStat({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 12,
        fontSize: 14,
      }}
    >
      <span style={{ color: "#667085" }}>{label}</span>
      <span style={{ color: "#101828", fontWeight: 700, textAlign: "right" }}>
        {value}
      </span>
    </div>
  );
}

const primaryLinkStyle: React.CSSProperties = {
  borderRadius: 14,
  border: "1px solid rgba(16,24,40,0.08)",
  background: "#101828",
  color: "#ffffff",
  padding: "12px 16px",
  fontSize: 14,
  fontWeight: 700,
  cursor: "pointer",
  textDecoration: "none",
};

const secondaryLinkStyle: React.CSSProperties = {
  borderRadius: 14,
  border: "1px solid rgba(16,24,40,0.08)",
  background: "#ffffff",
  color: "#344054",
  padding: "12px 14px",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
  textDecoration: "none",
  display: "inline-block",
};
