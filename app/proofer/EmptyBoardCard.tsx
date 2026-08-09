// The board's empty state for a poster with no account yet. This card IS the
// tour's welcome screen for anyone who lands back on an empty board — same
// wave, same promise — and its CTA carries ?start=1, which skips onboarding's
// own welcome step so the invitation isn't read twice.
//
// Extracted from app/proofer/page.tsx so the dev preview harness renders the
// real card rather than a copy that can drift out of sync with it.
export default function EmptyBoardCard({ base }: { base: string }) {
  return (
    <div style={setupCardStyle}>
      <div style={{ fontSize: 40, lineHeight: 1 }}>👋</div>
      <h2
        style={{
          margin: "8px 0 0",
          fontSize: 24,
          fontWeight: 850,
          letterSpacing: -0.4,
          color: "#18181b",
        }}
      >
        Let&apos;s create your first post
      </h2>
      <p
        style={{
          margin: "12px 0 0",
          fontSize: 15,
          color: "#52525b",
          lineHeight: 1.55,
          maxWidth: 520,
        }}
      >
        You don&apos;t have an account yet. We&apos;ll show you how Proofer works by
        making one together — it connects a social account and walks you through
        your first post. It takes about 2 minutes, and you stay in control the
        whole way.
      </p>
      <a href={`${base}/onboarding?start=1`} style={setupCtaStyle}>
        Let&apos;s go →
      </a>
      <p style={{ margin: "18px 0 0", fontSize: 12, color: "#a1a1aa" }}>
        You can restart this tour any time from the “?” menu.
      </p>
    </div>
  );
}

const setupCardStyle: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #e4e4e7",
  borderRadius: 16,
  padding: "28px 26px",
  boxShadow: "0 1px 2px rgba(24,24,27,.04), 0 20px 40px -28px rgba(24,24,27,.18)",
};

const setupCtaStyle: React.CSSProperties = {
  display: "inline-block",
  marginTop: 20,
  background: "#6d28d9",
  color: "#fff",
  fontSize: 16,
  fontWeight: 700,
  borderRadius: 12,
  padding: "13px 24px",
  textDecoration: "none",
};
