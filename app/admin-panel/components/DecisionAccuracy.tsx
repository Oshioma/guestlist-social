/**
 * "Decision accuracy" — closes the prediction loop on the dashboard.
 *
 * Server component. Reads the last 30 days of measured `decision_outcomes`
 * rows and surfaces a single number that answers the only question that
 * matters about the engine: "is it actually right?"
 *
 * The number is the share of measured decisions whose verdict was
 * `positive`. Inconclusive rows are excluded from both the numerator and
 * denominator — they tell us "we couldn't tell" not "the engine was wrong",
 * and bundling them in either direction would lie. We surface the
 * inconclusive count separately so the operator can see how much of the
 * sample we had to drop.
 *
 * Empty state is intentional: it tells the operator the loop hasn't
 * resolved any rows yet, which is itself an actionable signal (either
 * nothing has been executed live, or the follow-up sweep hasn't run).
 */

import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

const WINDOW_DAYS = 30;

type OutcomeRow = {
  verdict: "positive" | "neutral" | "negative" | "inconclusive" | string;
  decision_type: string;
  ctr_lift_pct: number | null;
  measured_at: string;
};

export default async function DecisionAccuracy() {
  const supabase = await createClient();

  const sinceIso = new Date(
    Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();

  const { data, error } = await supabase
    .from("decision_outcomes")
    .select("verdict, decision_type, ctr_lift_pct, measured_at")
    .eq("status", "measured")
    .gte("measured_at", sinceIso)
    .order("measured_at", { ascending: false })
    .limit(500);

  if (error) {
    return (
      <Card>
        <Header />
        <Body>
          Couldn&rsquo;t load decision outcomes ({error.message}).
        </Body>
      </Card>
    );
  }

  const rows = (data ?? []) as OutcomeRow[];

  if (rows.length === 0) {
    return (
      <Card>
        <Header />
        <Body>
          Nothing to score yet. Once a change has been live for a week, we
          come back, check whether it actually helped, and report the result
          here.
        </Body>
      </Card>
    );
  }

  // Bucket the verdicts. Inconclusive sits outside the accuracy ratio.
  const positive = rows.filter((r) => r.verdict === "positive").length;
  const neutral = rows.filter((r) => r.verdict === "neutral").length;
  const negative = rows.filter((r) => r.verdict === "negative").length;
  const inconclusive = rows.filter((r) => r.verdict === "inconclusive").length;

  const decisive = positive + neutral + negative;
  const accuracyPct = decisive > 0 ? Math.round((positive / decisive) * 100) : null;

  // Average CTR lift across the rows that have one — use this as a
  // secondary signal so the operator can see "right" + "by how much".
  const liftSamples = rows
    .map((r) => r.ctr_lift_pct)
    .filter((v): v is number => v != null && Number.isFinite(v));
  const avgLift =
    liftSamples.length > 0
      ? liftSamples.reduce((a, b) => a + b, 0) / liftSamples.length
      : null;

  return (
    <Card>
      <Header />
      <div
        style={{
          marginTop: 14,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: 12,
        }}
      >
        <Stat
          label={`How often the engine was right (last ${WINDOW_DAYS}d)`}
          value={accuracyPct != null ? `${accuracyPct}%` : "—"}
          sublabel={`${positive} of ${decisive} had a clear answer`}
          tone={
            accuracyPct == null
              ? "neutral"
              : accuracyPct >= 60
              ? "positive"
              : accuracyPct >= 40
              ? "neutral"
              : "negative"
          }
        />
        <Stat
          label="Avg CTR lift"
          value={
            avgLift != null
              ? `${avgLift > 0 ? "+" : ""}${avgLift.toFixed(1)}%`
              : "—"
          }
          sublabel={`${liftSamples.length} measured`}
          tone={
            avgLift == null
              ? "neutral"
              : avgLift > 0
              ? "positive"
              : avgLift < 0
              ? "negative"
              : "neutral"
          }
        />
        <Stat
          label="Decisions measured"
          value={String(decisive)}
          sublabel={`+${inconclusive} too soon to tell`}
          tone="neutral"
        />
      </div>

      <div
        style={{
          marginTop: 14,
          display: "flex",
          gap: 14,
          fontSize: 12,
          color: "#94a3b8",
          flexWrap: "wrap",
        }}
      >
        <span>
          <Dot color="#4ade80" /> {positive} helped
        </span>
        <span>
          <Dot color="#fbbf24" /> {neutral} did nothing
        </span>
        <span>
          <Dot color="#f87171" /> {negative} hurt
        </span>
        <span>
          <Dot color="#64748b" /> {inconclusive} too soon to tell
        </span>
      </div>

      <div
        style={{
          marginTop: 14,
          fontSize: 11,
          color: "#64748b",
          lineHeight: 1.5,
        }}
      >
        We wait a week after each change goes live, then compare the ad&rsquo;s
        new click-through rate to where it started. &ldquo;Too soon to tell&rdquo;
        means the ad didn&rsquo;t get enough traffic to call it either way.{" "}
        <Link
          href="/app/meta-queue"
          style={{ color: "#93c5fd", textDecoration: "none" }}
        >
          See the queue →
        </Link>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Local presentational helpers — kept inline so the component is one file.
// ---------------------------------------------------------------------------

function Card({ children }: { children: React.ReactNode }) {
  return (
    <section
      style={{
        borderRadius: 16,
        padding: 20,
        background: "linear-gradient(135deg, #0c1117 0%, #1a2230 100%)",
        color: "#fff",
        border: "1px solid #1f2937",
      }}
    >
      {children}
    </section>
  );
}

function Header() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        flexWrap: "wrap",
      }}
    >
      <div
        style={{
          padding: "4px 10px",
          borderRadius: 999,
          background: "rgba(74,222,128,0.12)",
          color: "#86efac",
          fontSize: 11,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
        }}
      >
        Engine track record
      </div>
      <h2
        style={{
          margin: 0,
          fontSize: 18,
          fontWeight: 700,
          letterSpacing: "-0.01em",
        }}
      >
        Was the engine right?
      </h2>
      <span style={{ fontSize: 12, color: "#64748b" }}>
        last {WINDOW_DAYS} days
      </span>
    </div>
  );
}

function Body({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        marginTop: 14,
        fontSize: 13,
        color: "#94a3b8",
        lineHeight: 1.6,
      }}
    >
      {children}
    </div>
  );
}

function Stat({
  label,
  value,
  sublabel,
  tone,
}: {
  label: string;
  value: string;
  sublabel: string;
  tone: "positive" | "neutral" | "negative";
}) {
  const valueColor =
    tone === "positive" ? "#4ade80" : tone === "negative" ? "#f87171" : "#f1f5f9";
  return (
    <div
      style={{
        padding: "12px 14px",
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 10,
      }}
    >
      <div
        style={{
          fontSize: 11,
          color: "#94a3b8",
          textTransform: "uppercase",
          letterSpacing: "0.04em",
        }}
      >
        {label}
      </div>
      <div
        style={{
          marginTop: 6,
          fontSize: 26,
          fontWeight: 700,
          color: valueColor,
          letterSpacing: "-0.02em",
        }}
      >
        {value}
      </div>
      <div style={{ marginTop: 4, fontSize: 11, color: "#64748b" }}>
        {sublabel}
      </div>
    </div>
  );
}

function Dot({ color }: { color: string }) {
  return (
    <span
      style={{
        display: "inline-block",
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: color,
        marginRight: 6,
        verticalAlign: "middle",
      }}
    />
  );
}
