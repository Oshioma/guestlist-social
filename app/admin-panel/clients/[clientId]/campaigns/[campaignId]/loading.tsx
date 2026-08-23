/**
 * Streamed shell for the campaign page.
 *
 * This route is where "Create campaign" redirects to, and it renders a lot on
 * the server (client + campaign + ads + learnings, the creative library, and a
 * Meta lookup for the ad-account name). Without a loading boundary the router
 * has to wait for all of that before it can commit the navigation, so the
 * submit button that triggered the redirect stays stuck on "Creating…" for the
 * whole render. With one, the navigation commits immediately and the page
 * fills in behind this skeleton.
 */
export default function Loading() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <Block width={90} height={13} />
        <Block width={160} height={15} />
      </div>

      <div
        style={{
          background: "#fff",
          border: "1px solid #e4e4e7",
          borderRadius: 16,
          padding: 24,
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <Block width={240} height={22} />
        <Block width={160} height={13} />
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 6 }}>
          <Block width={110} height={58} />
          <Block width={110} height={58} />
          <Block width={110} height={58} />
          <Block width={110} height={58} />
        </div>
      </div>

      <div
        style={{
          background: "#fff",
          border: "1px solid #e4e4e7",
          borderRadius: 16,
          padding: 24,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <Block width={120} height={15} />
        <Block width="100%" height={64} />
        <Block width="100%" height={64} />
      </div>

      <span style={{ fontSize: 13, color: "#71717a" }}>Loading campaign…</span>
    </div>
  );
}

function Block({ width, height }: { width: number | string; height: number }) {
  return (
    <span
      aria-hidden
      style={{
        display: "block",
        width,
        height,
        borderRadius: 8,
        background: "#f4f4f5",
      }}
    />
  );
}
