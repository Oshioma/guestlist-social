import Link from "next/link";
import type { Metadata } from "next";
import { PLANS, PLAN_ORDER, TRIAL_DAYS, type Plan } from "@/lib/billing/plans";

export const metadata: Metadata = {
  title: "Pricing — PostProofer",
  description:
    "Simple plans for PostProofer. Start free, upgrade when you grow. Every paid plan starts with a 30-day free trial.",
};

// Public pricing page (reachable logged-out, like /terms and /privacy). It
// renders straight from the plan catalogue in lib/billing/plans, so the numbers
// here can never drift from what checkout and the limit-enforcement actually
// charge and allow.

// The headline per plan leads with the team allowance — the key difference
// between tiers. Free includes one team (your personal workspace); paid plans
// are unlimited. The social-account limit lives in the feature bullets below.
function planHeadline(plan: Plan): string {
  const m = PLANS[plan].maxOwnedTeams;
  return m === null ? "Unlimited teams" : `${m} team${m === 1 ? "" : "s"}`;
}

const RECOMMENDED: Plan = "pro";

export default function PricingPage() {
  return (
    <main style={wrap}>
      <div style={inner}>
        <div style={{ marginBottom: 24 }}>
          <Link href="/" style={homeLink}>
            &larr; Home
          </Link>
        </div>

        <header style={{ textAlign: "center", marginBottom: 8 }}>
          <h1 style={h1}>Simple pricing that grows with you</h1>
          <p style={sub}>
            Start free. Every paid plan begins with a {TRIAL_DAYS}-day free
            trial — no charge until it ends, cancel any time.
          </p>
        </header>

        <div style={grid}>
          {PLAN_ORDER.map((plan) => {
            const cfg = PLANS[plan];
            const recommended = plan === RECOMMENDED;
            return (
              <section
                key={plan}
                style={{
                  ...card,
                  borderColor: recommended ? "#6366f1" : "#e7e5e4",
                  boxShadow: recommended
                    ? "0 8px 30px rgba(99,102,241,0.14)"
                    : "0 1px 2px rgba(0,0,0,0.03)",
                }}
              >
                {recommended && <div style={ribbon}>Most popular</div>}
                <h2 style={planName}>{cfg.name}</h2>
                <div style={priceRow}>
                  <span style={priceBig}>
                    {cfg.priceMonthly === 0 ? "Free" : cfg.priceLabel.replace("/mo", "")}
                  </span>
                  {cfg.priceMonthly !== 0 && <span style={priceUnit}>/mo</span>}
                </div>
                <p style={headline}>{planHeadline(plan)}</p>

                <ul style={featureList}>
                  {cfg.features.map((f) => (
                    <li key={f} style={featureItem}>
                      <span style={check} aria-hidden="true">
                        ✓
                      </span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                <Link
                  href="/sign-up"
                  style={{
                    ...cta,
                    background: recommended ? "#4f46e5" : "#18181b",
                  }}
                >
                  {plan === "free" ? "Get started" : `Start ${TRIAL_DAYS}-day free trial`}
                </Link>
              </section>
            );
          })}
        </div>

        <p style={footnote}>
          A social account is one connected Instagram or Facebook profile.
          Upgrade, downgrade or cancel any time from your team&rsquo;s billing
          settings. Prices in USD.
        </p>

        <footer style={footer}>
          <Link href="/pricing" style={footLink}>
            Pricing
          </Link>
          <span style={{ color: "#d4d4d8" }}>·</span>
          <Link href="/privacy" style={footLink}>
            Privacy Policy
          </Link>
          <span style={{ color: "#d4d4d8" }}>·</span>
          <Link href="/terms" style={footLink}>
            Terms &amp; Conditions
          </Link>
        </footer>
      </div>
    </main>
  );
}

const wrap: React.CSSProperties = {
  minHeight: "100vh",
  background: "#fafaf9",
  padding: "48px 20px",
  color: "#27272a",
  fontFamily:
    "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif",
};

const inner: React.CSSProperties = {
  maxWidth: 980,
  margin: "0 auto",
};

const h1: React.CSSProperties = {
  fontSize: 32,
  fontWeight: 800,
  letterSpacing: "-0.02em",
  margin: "0 0 10px",
};

const sub: React.CSSProperties = {
  fontSize: 16,
  lineHeight: 1.6,
  color: "#52525b",
  maxWidth: 560,
  margin: "0 auto",
};

const grid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
  gap: 20,
  marginTop: 36,
  alignItems: "stretch",
};

const card: React.CSSProperties = {
  position: "relative",
  background: "#fff",
  border: "1px solid #e7e5e4",
  borderRadius: 16,
  padding: "28px 24px",
  display: "flex",
  flexDirection: "column",
};

const ribbon: React.CSSProperties = {
  position: "absolute",
  top: 16,
  right: 16,
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  color: "#4f46e5",
  background: "#eef2ff",
  border: "1px solid #dbe2fb",
  borderRadius: 999,
  padding: "3px 9px",
};

const planName: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 700,
  margin: "0 0 12px",
};

const priceRow: React.CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  gap: 4,
};

const priceBig: React.CSSProperties = {
  fontSize: 38,
  fontWeight: 800,
  letterSpacing: "-0.02em",
};

const priceUnit: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 600,
  color: "#71717a",
};

const headline: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  color: "#3f3f46",
  margin: "8px 0 18px",
};

const featureList: React.CSSProperties = {
  listStyle: "none",
  padding: 0,
  margin: "0 0 24px",
  display: "flex",
  flexDirection: "column",
  gap: 10,
  flex: 1,
};

const featureItem: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 9,
  fontSize: 14.5,
  color: "#3f3f46",
  lineHeight: 1.4,
};

const check: React.CSSProperties = {
  color: "#16a34a",
  fontWeight: 800,
  flexShrink: 0,
};

const cta: React.CSSProperties = {
  display: "block",
  textAlign: "center",
  color: "#fff",
  fontSize: 14,
  fontWeight: 700,
  borderRadius: 10,
  padding: "11px 16px",
  textDecoration: "none",
};

const footnote: React.CSSProperties = {
  fontSize: 13,
  color: "#71717a",
  textAlign: "center",
  maxWidth: 620,
  margin: "28px auto 0",
  lineHeight: 1.6,
};

const homeLink: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: "#71717a",
  textDecoration: "none",
};

const footer: React.CSSProperties = {
  marginTop: 40,
  paddingTop: 20,
  borderTop: "1px solid #ececec",
  display: "flex",
  justifyContent: "center",
  gap: 12,
  fontSize: 13,
};

const footLink: React.CSSProperties = {
  color: "#52525b",
  fontWeight: 600,
  textDecoration: "none",
};
