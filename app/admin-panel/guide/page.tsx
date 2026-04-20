export default function GuidePage() {
  return (
    <div style={{ maxWidth: 780, display: "flex", flexDirection: "column", gap: 36 }}>
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
          Platform guide
        </h1>
        <p style={{ margin: "10px 0 0", fontSize: 15, color: "#71717a" }}>
          Everything the platform does, feature by feature. Three products in one
          admin panel: the Decision Engine, Social Publisher, and Campaign Creator.
        </p>
      </div>

      <GroupHeader title="Getting started" />

      <section>
        <StepHeader number={1} title="Connect your Meta account" />
        <p style={bodyStyle}>
          Go to <strong>Settings</strong> and check the <strong>API Keys</strong> section.
          You need <strong>META_ACCESS_TOKEN</strong> and <strong>META_AD_ACCOUNT_ID</strong> set
          in your Vercel environment variables. Once connected, click <strong>Import from
          Meta</strong> to pull your campaigns, ads, and performance data.
        </p>
      </section>

      <section>
        <StepHeader number={2} title="Navigate the sidebar" />
        <p style={bodyStyle}>
          The sidebar is grouped into product areas:
        </p>
        <ul style={listStyle}>
          <li><strong>Workspace</strong> &mdash; Dashboard and Clients (your daily starting points)</li>
          <li><strong>Engine</strong> &mdash; Meta queue, Playbook, Creative library, Reports, Memory</li>
          <li><strong>Publisher</strong> &mdash; Proofer (calendar), Publish queue, Ideas, Content</li>
          <li><strong>Utility</strong> &mdash; Tasks, Settings, Guide</li>
        </ul>
      </section>

      <GroupHeader title="Decision Engine" />

      <section>
        <StepHeader number={3} title="Score and generate decisions" />
        <p style={bodyStyle}>
          On any client&rsquo;s <strong>Ads</strong> page, click <strong>Score &amp;
          Generate</strong>. The engine scores every ad by CTR, CPC, conversions, and spend,
          then generates recommendations: scale winners, pause losers, apply cross-client
          patterns. Each decision shows confidence level and evidence from the agency playbook.
        </p>
        <p style={bodyStyle}>
          The ads page has <strong>four tabs</strong>: Ads (the grid), Actions &amp; Decisions,
          Playbook (with learnings), and Experiments.
        </p>
      </section>

      <section>
        <StepHeader number={4} title="Approve and execute decisions" />
        <p style={bodyStyle}>
          Decisions land in the <strong>Meta queue</strong> for approval. You can:
        </p>
        <ul style={listStyle}>
          <li><strong>Preview</strong> &mdash; re-fetch live state from Meta before acting</li>
          <li><strong>Approve</strong> &mdash; green-light the decision (or let auto-approve handle it)</li>
          <li><strong>Execute</strong> &mdash; push the change to Meta (pause, budget bump, etc.)</li>
          <li><strong>Cancel</strong> &mdash; reject the recommendation</li>
        </ul>
        <p style={bodyStyle}>
          Stale approvals (older than 60 minutes) are automatically rejected &mdash; you&rsquo;ll
          need to preview fresh state and re-approve. Errors show a banner with a retry button.
        </p>
      </section>

      <section>
        <StepHeader number={5} title="Auto-approve low-risk decisions" />
        <p style={bodyStyle}>
          In <strong>Settings &rarr; Auto-Approve Decisions</strong>, toggle auto-approve on.
          Pick the minimum confidence level (High only, or Medium+) and which decision types
          to auto-approve (defaults to Pause/Replace and Kill Test). Auto-approved decisions
          are tagged <code style={codeStyle}>auto:engine</code> and still need explicit execution
          &mdash; auto-approve gives the green light but doesn&rsquo;t push to Meta automatically.
        </p>
      </section>

      <section>
        <StepHeader number={6} title="Track outcomes &mdash; was the engine right?" />
        <p style={bodyStyle}>
          After executing a decision, the engine waits 7 days, then measures whether the
          ad&rsquo;s CTR improved. Results appear as colour-coded badges on each ad card:
          green (positive), amber (neutral), red (negative). The <strong>&ldquo;Was the engine
          right?&rdquo;</strong> tile on the Dashboard and Playbook tab shows the overall accuracy.
        </p>
      </section>

      <section>
        <StepHeader number={7} title="Tune engine thresholds" />
        <p style={bodyStyle}>
          In <strong>Settings &rarr; Engine Scoring Thresholds</strong>, adjust what the engine
          considers &ldquo;good&rdquo; or &ldquo;bad&rdquo;: Good CTR, Bad CTR, Good CPC, Bad CPC,
          max cost per result, minimum spend to judge, minimum impressions. Changes take effect
          immediately &mdash; ad scores on the next page load use the new thresholds.
        </p>
      </section>

      <GroupHeader title="Social Publisher" />

      <section>
        <StepHeader number={8} title="Plan posts in the Proofer" />
        <p style={bodyStyle}>
          Go to <strong>Proofer</strong>. Select a client and month. Click any day cell to write
          a caption, upload images (or paste a URL), and pick the platform (IG Feed, IG Story,
          IG Reel, Facebook). Use the traffic-light status dots to move posts through the
          workflow: improve &rarr; check &rarr; proofed &rarr; approved.
        </p>
      </section>

      <section>
        <StepHeader number={9} title="Comments and review workflow" />
        <p style={bodyStyle}>
          Click <strong>Comments</strong> on any post to leave feedback. Comments support
          <strong> @mentions</strong> (type <code style={codeStyle}>@name</code> &mdash;
          they&rsquo;ll highlight in indigo). Use the <strong>Resolve</strong> button to mark
          feedback as handled, and the <strong>Hide resolved</strong> toggle to filter the list.
        </p>
      </section>

      <section>
        <StepHeader number={10} title="Publish and schedule posts" />
        <p style={bodyStyle}>
          Go to <strong>Publish queue</strong>. Approved posts appear in the &ldquo;Ready to
          Queue&rdquo; section. Queue them to a connected Meta account, optionally set a
          scheduled time. The cron runs every 5 minutes and publishes scheduled posts
          automatically. Supports <strong>IG Feed, IG Stories, and Facebook</strong>.
        </p>
        <p style={bodyStyle}>
          Published posts show a <strong>carousel preview</strong> (with left/right navigation)
          and <strong>insights</strong> (reach, impressions, engagement, likes, comments) fetched
          automatically 24 hours after publishing.
        </p>
      </section>

      <section>
        <StepHeader number={11} title="Boost published posts" />
        <p style={bodyStyle}>
          Any published post with a URL shows a purple <strong>Boost</strong> button. Click it
          to put money behind the organic post: pick a daily budget (£5/10/25/50) and duration
          (3/5/7/14 days), then hit Boost now. The post becomes a promoted ad directly in Meta.
        </p>
      </section>

      <section>
        <StepHeader number={12} title="Plan ideas" />
        <p style={bodyStyle}>
          Go to <strong>Ideas</strong> for a combined view of Video, Carousel, and Story content
          ideas, organised by client with monthly themes. Switch between tabs. Link ideas to
          content pillars for consistent strategy tracking.
        </p>
      </section>

      <GroupHeader title="Campaign Creator" />

      <section>
        <StepHeader number={13} title="Create a campaign with AI suggestions" />
        <p style={bodyStyle}>
          Go to a client &rarr; <strong>New campaign</strong>. The form has a suggestions sidebar
          that pulls from three sources: the client&rsquo;s own playbook, the agency-wide playbook,
          and past winning ads. Click <strong>Apply</strong> on any suggestion to pre-fill the form.
        </p>
        <p style={bodyStyle}>
          Above the form, <strong>AI Suggest</strong> buttons let you ask Claude for recommendations
          on Audience, Headline, Budget, and Creative direction. Claude reads your internal data,
          competitor ads from the Meta Ad Library, and optionally the client&rsquo;s website.
        </p>
        <p style={bodyStyle}>
          On submit, the campaign + ad set are created directly in Meta. You&rsquo;re redirected
          to the campaign detail page where you can add ads.
        </p>
      </section>

      <section>
        <StepHeader number={14} title="Add ads with AI creative" />
        <p style={bodyStyle}>
          On the campaign detail page, click <strong>Add ad</strong>. The ad form has three
          AI features:
        </p>
        <ul style={listStyle}>
          <li><strong>AI Write Copy</strong> &mdash; generates headline, body text, and picks the best CTA in one click</li>
          <li><strong>AI Creative</strong> &mdash; generates a detailed image brief (always free) and optionally a DALL-E image (when enabled in Settings)</li>
          <li><strong>Creative Library</strong> &mdash; browse past ad images, proofer photos, and Meta library creatives, with CTR + spend stats</li>
        </ul>
        <p style={bodyStyle}>
          Ads are created as <strong>PAUSED</strong> in Meta so you can review before going live.
        </p>
      </section>

      <section>
        <StepHeader number={15} title="Manage ads from the campaign page" />
        <p style={bodyStyle}>
          Each ad on the campaign detail page has quick action buttons:
        </p>
        <ul style={listStyle}>
          <li><strong>Activate / Pause</strong> &mdash; toggle the ad status directly in Meta with one click</li>
          <li><strong>Duplicate</strong> &mdash; clone a winning ad with a new name (creates a new creative + ad in Meta)</li>
          <li><strong>Edit budget</strong> &mdash; inline daily budget editor on the campaign stats</li>
        </ul>
      </section>

      <GroupHeader title="Settings &amp; configuration" />

      <section>
        <StepHeader number={16} title="AI Suggestion Sources" />
        <p style={bodyStyle}>
          In <strong>Settings &rarr; AI Suggestion Sources</strong>, toggle which data sources
          the AI reads when generating suggestions:
        </p>
        <ul style={listStyle}>
          <li><strong>Internal data</strong> (on by default) &mdash; winners, losers, playbook, patterns, captions</li>
          <li><strong>Meta Ad Library</strong> (on by default) &mdash; live competitor ads</li>
          <li><strong>Client website</strong> (off by default) &mdash; scrapes brand voice from landing page</li>
          <li><strong>AI Image Generation</strong> (off by default) &mdash; generates images via DALL-E 3 (~£0.04/image, needs OPENAI_API_KEY)</li>
        </ul>
      </section>

      <section>
        <StepHeader number={17} title="API keys and connected accounts" />
        <p style={bodyStyle}>
          The <strong>API Keys</strong> section shows green/red status for each required
          env var. The <strong>Connected Meta Accounts</strong> section lists all OAuth-connected
          accounts with token expiry warnings &mdash; red for expired, amber for expiring
          within 7 days. Token expiry banners also appear on the Dashboard and Publish queue.
        </p>
      </section>

      <section>
        <StepHeader number={18} title="Client portal" />
        <p style={bodyStyle}>
          Create a portal user by adding a row in <code style={codeStyle}>client_user_links</code> linking
          a Supabase auth user to a client. They&rsquo;ll see a read-only view at
          <code style={codeStyle}>/portal/[clientId]</code> with their ads, reviews, and
          what changed since the last review. RLS policies ensure they can only see their own data.
        </p>
      </section>

      <section>
        <StepHeader number={19} title="Audit trail" />
        <p style={bodyStyle}>
          Every write to Meta &mdash; decision execution, campaign creation, ad creation,
          post publishing, boosting &mdash; is logged in the <code style={codeStyle}>meta_write_log</code> table
          with the full request/response (tokens redacted), HTTP status, duration, and timestamp.
          Query it in Supabase to see exactly what the platform sent to Meta and when.
        </p>
      </section>
    </div>
  );
}

function GroupHeader({ title }: { title: string }) {
  return (
    <div
      style={{
        borderTop: "2px solid #e4e4e7",
        paddingTop: 12,
      }}
    >
      <h2
        style={{
          margin: 0,
          fontSize: 11,
          fontWeight: 700,
          color: "#71717a",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
        }}
      >
        {title}
      </h2>
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

const codeStyle: React.CSSProperties = {
  fontSize: 12,
  background: "#f4f4f5",
  padding: "1px 5px",
  borderRadius: 4,
  fontFamily: "monospace",
};
