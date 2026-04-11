import SectionCard from "@/app/admin-panel/components/SectionCard";

export default function AboutPage() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div>
        <h1
          style={{
            margin: 0,
            fontSize: 30,
            lineHeight: 1.05,
            fontWeight: 700,
            color: "#18181b",
            letterSpacing: "-0.03em",
          }}
        >
          About this tool
        </h1>
        <p style={{ margin: "10px 0 0", fontSize: 15, color: "#71717a", maxWidth: 640 }}>
          Guestlist Social builds ad intelligence that is explainable, testable,
          based on your own data, and easy to improve.
        </p>
      </div>

      <SectionCard title="Explainable">
        <p style={{ margin: 0, fontSize: 14, color: "#52525b", lineHeight: 1.6 }}>
          Every action the system generates comes with a clear rule and reason.
          You can see exactly why an ad was flagged — weak CTR, no delivery,
          worth scaling — and trace it back to the metric that triggered it.
          Nothing is a black box.
        </p>
      </SectionCard>

      <SectionCard title="Testable">
        <p style={{ margin: 0, fontSize: 14, color: "#52525b", lineHeight: 1.6 }}>
          Rules run against real campaign data every time you generate actions.
          You can update an ad, re-run the rules, and immediately see whether
          the system creates, keeps, or resolves actions. The feedback loop
          is instant.
        </p>
      </SectionCard>

      <SectionCard title="Based on your own data">
        <p style={{ margin: 0, fontSize: 14, color: "#52525b", lineHeight: 1.6 }}>
          Suggestions come from learnings your team has recorded — not
          generic advice. When you complete an action and log what you changed
          and what happened, the system matches that knowledge to future ads
          with similar problems. The more you use it, the smarter it gets.
        </p>
      </SectionCard>

      <SectionCard title="Easy to improve">
        <p style={{ margin: 0, fontSize: 14, color: "#52525b", lineHeight: 1.6 }}>
          Adding a new rule is straightforward: define a condition on ad metrics
          and a message. Learnings are captured in a simple form — problem, change,
          result. There is no model to retrain, no pipeline to rebuild. Your team
          improves the system just by using it.
        </p>
      </SectionCard>
    </div>
  );
}
