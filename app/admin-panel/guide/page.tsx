export default function GuidePage() {
  return (
    <div style={{ maxWidth: 720, display: "flex", flexDirection: "column", gap: 32 }}>
      <div>
        <h1
          style={{
            margin: 0,
            fontSize: 30,
            fontWeight: 700,
            color: "#18181b",
            letterSpacing: "-0.03em",
          }}
        >
          Getting started
        </h1>
        <p style={{ margin: "10px 0 0", fontSize: 15, color: "#71717a" }}>
          A quick walkthrough of how to use the ad ops dashboard.
        </p>
      </div>

      {/* Step 1 */}
      <section>
        <StepHeader number={1} title="Now you have created a client" />
        <p style={bodyStyle}>
          Go to <strong>Clients</strong> in the sidebar. You should see your client listed
          there. Click on the client name to open their detail page.
        </p>
        <p style={bodyStyle}>
          From the client page you can edit the client details, see all their campaigns,
          ads, creatives, and reports in one place.
        </p>
      </section>

      {/* Step 2 */}
      <section>
        <StepHeader number={2} title="Create a campaign" />
        <p style={bodyStyle}>
          On the client detail page, click <strong>New campaign</strong>. Fill in:
        </p>
        <ul style={listStyle}>
          <li><strong>Campaign name</strong> &mdash; something descriptive like &ldquo;Summer sale &mdash; image test&rdquo;</li>
          <li><strong>Objective</strong> &mdash; engagement, conversions, traffic, awareness, or leads</li>
          <li><strong>Budget</strong> &mdash; the planned spend for this campaign</li>
          <li><strong>Audience</strong> &mdash; who you are targeting (e.g. &ldquo;18-35, London, nightlife&rdquo;)</li>
          <li><strong>Status</strong> &mdash; usually start with &ldquo;Testing&rdquo;</li>
        </ul>
        <p style={bodyStyle}>
          After saving, you will be taken back to the client page where the campaign appears.
        </p>
      </section>

      {/* Step 3 */}
      <section>
        <StepHeader number={3} title="Add ads to the campaign" />
        <p style={bodyStyle}>
          Click <strong>Open campaign</strong> on any campaign card, then click <strong>Add ad</strong>.
          Fill in the ad name, status, and any early performance numbers you have
          (spend, impressions, clicks, etc.).
        </p>
        <p style={bodyStyle}>
          You can also add audience targeting notes, the creative hook, and any internal
          notes about the ad.
        </p>
      </section>

      {/* Step 4 */}
      <section>
        <StepHeader number={4} title="Actions are generated automatically" />
        <p style={bodyStyle}>
          Every time you create or edit an ad, the system evaluates it against a set of rules:
        </p>
        <ul style={listStyle}>
          <li><strong>Weak CTR</strong> &mdash; if spend &ge; 5 and CTR is between 0% and 1%, a &ldquo;Review weak ad&rdquo; action is created</li>
          <li><strong>Winner</strong> &mdash; if CTR &ge; 2.5% and spend &ge; 3, a &ldquo;Consider scaling&rdquo; action is created</li>
          <li><strong>Underperforming</strong> &mdash; if spend &ge; 8 but clicks &le; 2, a &ldquo;Pause&rdquo; action is created</li>
          <li><strong>No delivery</strong> &mdash; if spend and impressions are both 0, a &ldquo;Check delivery/setup&rdquo; action is created</li>
        </ul>
        <p style={bodyStyle}>
          Actions appear on the campaign detail page under <strong>Generated actions</strong>.
          You can mark them as done by checking the checkbox.
        </p>
      </section>

      {/* Step 5 */}
      <section>
        <StepHeader number={5} title="Stale actions close themselves" />
        <p style={bodyStyle}>
          When you update an ad and the numbers improve (e.g. CTR goes from 0.5% to 3%),
          the &ldquo;Review weak ad&rdquo; action is automatically marked as complete. The
          system re-evaluates every rule each time an ad is saved.
        </p>
        <p style={bodyStyle}>
          This means you do not need to manually close outdated actions &mdash; just keep
          updating the ad performance data and the system keeps up.
        </p>
      </section>

      {/* Step 6 */}
      <section>
        <StepHeader number={6} title="Edit anything at any time" />
        <p style={bodyStyle}>
          You can always go back and edit:
        </p>
        <ul style={listStyle}>
          <li>Client details (name, platform, budget, status, website, notes)</li>
          <li>Campaign settings (objective, audience, budget, status)</li>
          <li>Ad performance data and creative notes</li>
        </ul>
        <p style={bodyStyle}>
          Use the <strong>Edit</strong> buttons on client pages, campaign pages, and ad rows.
        </p>
      </section>

      {/* Step 7 */}
      <section>
        <StepHeader number={7} title="Use the dashboard for the big picture" />
        <p style={bodyStyle}>
          The <strong>Dashboard</strong> shows all your active clients, top-level stats,
          recent actions, and suggestions across every client. Use it as your daily
          starting point to see what needs attention.
        </p>
      </section>
    </div>
  );
}

function StepHeader({ number, title }: { number: number; title: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 28,
          height: 28,
          borderRadius: 999,
          background: "#18181b",
          color: "#fff",
          fontSize: 13,
          fontWeight: 700,
          flexShrink: 0,
        }}
      >
        {number}
      </span>
      <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: "#18181b" }}>
        {title}
      </h2>
    </div>
  );
}

const bodyStyle: React.CSSProperties = {
  margin: "0 0 8px",
  fontSize: 14,
  lineHeight: 1.6,
  color: "#3f3f46",
};

const listStyle: React.CSSProperties = {
  margin: "0 0 8px",
  paddingLeft: 20,
  fontSize: 14,
  lineHeight: 1.8,
  color: "#3f3f46",
};
