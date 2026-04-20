export default function GuidePage() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
        {/* ── PROOF ── */}
        <div style={columnStyle}>
          <div style={{ ...headerStyle, background: "#fdf2f8", borderColor: "#f9a8d4" }}>
            <h2 style={headerTitleStyle}>Proof</h2>
            <p style={headerSubStyle}>Plan, proof, and publish social content</p>
          </div>

          <Step title="Plan posts">
            Open <b>Proofer</b>, pick a client and month. Click any day to write a caption,
            upload images, and choose the platform (IG Feed, Story, Reel, Facebook).
          </Step>

          <Step title="Review workflow">
            Move posts through statuses: <Tag bg="#fee2e2" color="#991b1b">improve</Tag>{" "}
            <Tag bg="#fef3c7" color="#92400e">check</Tag>{" "}
            <Tag bg="#dbeafe" color="#1e40af">proofed</Tag>{" "}
            <Tag bg="#dcfce7" color="#166534">approved</Tag>
          </Step>

          <Step title="Comments">
            Leave feedback with @mentions. Resolve comments when handled.
            Use <b>Hide resolved</b> to keep the view clean.
          </Step>

          <Step title="Publish">
            Approved posts appear in <b>Publish queue</b>. Queue to a connected
            Meta account, set a schedule, and the cron publishes automatically.
            Supports IG Feed, Stories, and Facebook.
          </Step>

          <Step title="Boost">
            Published posts show a <b>Boost</b> button. Pick a budget and duration
            to promote the organic post as a paid ad in Meta.
          </Step>

          <Step title="Ideas">
            Use <b>Ideas</b> to plan Video, Carousel, and Story content by client
            and month. Link ideas to content pillars for strategy tracking.
          </Step>

          <Step title="Insights">
            Published posts auto-fetch reach, impressions, engagement, likes,
            and comments 24 hours after publishing.
          </Step>
        </div>

        {/* ── ADVERTS ── */}
        <div style={columnStyle}>
          <div style={{ ...headerStyle, background: "#ecfdf5", borderColor: "#a7f3d0" }}>
            <h2 style={headerTitleStyle}>Adverts</h2>
            <p style={headerSubStyle}>Create and manage paid ad campaigns</p>
          </div>

          <Step title="Create a campaign">
            Go to a client → <b>New campaign</b>. AI suggests audience, headline,
            and budget. Pick from audience presets or type your own. Campaign + ad set
            are created in Meta automatically.
          </Step>

          <Step title="AI suggestions">
            The form pulls from three sources: client playbook, agency playbook,
            and past winners. Click <b>Apply</b> to pre-fill. Each field also has
            a <b>Next idea</b> button for fresh AI suggestions.
          </Step>

          <Step title="Add ads with AI">
            On the campaign page, upload an image, write copy, and create the ad.
            Three AI tools: <b>AI Write Copy</b> (headline + body), <b>AI Creative</b>
            (image brief + optional DALL-E), <b>Creative Library</b> (past images with stats).
          </Step>

          <Step title="Ad preview">
            Each ad shows a Facebook-style preview card so you can check how it looks
            before pushing live. Click <b>Push to Meta</b> when ready.
          </Step>

          <Step title="Quick actions">
            Activate, pause, or duplicate ads directly from the campaign page.
            Inline budget editor lets you adjust daily spend without leaving the page.
          </Step>

          <Step title="Delete campaigns">
            Delete button on each campaign card. Confirms before deleting.
            Sets campaign to DELETED in Meta and removes local data.
          </Step>

          <Step title="Per-client AI rules">
            Edit a client → <b>AI instructions</b>. Write rules or click
            <b> AI Generate</b> to auto-create 5 rules from the client profile.
            These guide all AI copy and suggestions for that client.
          </Step>
        </div>

        {/* ── DECISIONS ── */}
        <div style={columnStyle}>
          <div style={{ ...headerStyle, background: "#eef2ff", borderColor: "#c7d2fe" }}>
            <h2 style={headerTitleStyle}>Decisions</h2>
            <p style={headerSubStyle}>Score ads and act on engine recommendations</p>
          </div>

          <Step title="Score ads">
            On any client&rsquo;s <b>Ads</b> page, click <b>Score &amp; Generate</b>.
            The engine scores every ad by CTR, CPC, conversions, and spend, then
            generates actions and decisions with confidence levels.
          </Step>

          <Step title="Approve decisions">
            Decisions land in the <b>Meta queue</b>. Preview live state, approve,
            then execute to push changes to Meta (pause, budget bump, etc.).
            Stale approvals (60min+) auto-reject — re-preview and re-approve.
          </Step>

          <Step title="Auto-approve">
            In <b>Settings → Auto-Approve</b>, toggle on and pick minimum confidence
            and decision types. Auto-approved decisions still need manual execution —
            it gives the green light but doesn&rsquo;t push to Meta automatically.
          </Step>

          <Step title="Track outcomes">
            After executing, the engine waits 7 days then measures CTR change.
            Results show as badges: <Tag bg="#dcfce7" color="#166534">positive</Tag>{" "}
            <Tag bg="#fef3c7" color="#92400e">neutral</Tag>{" "}
            <Tag bg="#fee2e2" color="#991b1b">negative</Tag>
          </Step>

          <Step title="Engine accuracy">
            The <b>Was the engine right?</b> tile on the Dashboard and Playbook
            tab shows overall accuracy across all decisions.
          </Step>

          <Step title="Tune thresholds">
            In <b>Settings → Engine Thresholds</b>, adjust what counts as good/bad
            CTR, CPC, max cost per result, minimum spend and impressions to judge.
            Changes take effect immediately.
          </Step>

          <Step title="Audit trail">
            Every Meta write (decisions, campaigns, ads, publishing, boosts)
            is logged in <code style={codeStyle}>meta_write_log</code> with full
            request/response, HTTP status, and timestamp.
          </Step>
        </div>
      </div>
    </div>
  );
}

function Step({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: "10px 14px", borderBottom: "1px solid #f4f4f5" }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: "#18181b", marginBottom: 4 }}>
        {title}
      </div>
      <div style={{ fontSize: 12, color: "#52525b", lineHeight: 1.6 }}>
        {children}
      </div>
    </div>
  );
}

function Tag({ bg, color, children }: { bg: string; color: string; children: React.ReactNode }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "1px 8px",
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 600,
        background: bg,
        color,
      }}
    >
      {children}
    </span>
  );
}

const columnStyle: React.CSSProperties = {
  border: "1px solid #e4e4e7",
  borderRadius: 14,
  background: "#fff",
  overflow: "hidden",
};

const headerStyle: React.CSSProperties = {
  padding: "16px 14px",
  borderBottom: "1px solid #e4e4e7",
};

const headerTitleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 18,
  fontWeight: 700,
  color: "#18181b",
};

const headerSubStyle: React.CSSProperties = {
  margin: "4px 0 0",
  fontSize: 12,
  color: "#71717a",
};

const codeStyle: React.CSSProperties = {
  fontSize: 11,
  background: "#f4f4f5",
  padding: "1px 4px",
  borderRadius: 4,
  fontFamily: "monospace",
};
