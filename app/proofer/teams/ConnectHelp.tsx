// A small, self-contained "why won't my account connect?" helper shown on the
// Teams page next to where you connect accounts. Plain <details> — no client JS.
// Tailored by whether Instagram-only login is enabled on this deployment.
//
// Kept manager-friendly: the things a team manager can actually check or
// escalate. Deep operator setup (env vars, redirect URIs, App Review) lives in
// Super admin → System, not here.
export function ConnectHelp({ igConfigured }: { igConfigured: boolean }) {
  return (
    <details style={wrap}>
      <summary style={summary}>Trouble connecting an account?</summary>
      <div style={body}>
        {!igConfigured && (
          <p style={note}>
            <strong>Instagram-only connecting isn&rsquo;t enabled here yet.</strong>{" "}
            If the account has a Facebook Page, use <strong>Connect Facebook</strong>{" "}
            — its linked Instagram comes with it. If it&rsquo;s Instagram-only,
            ask your admin to switch on Instagram login.
          </p>
        )}

        <p style={lead}>If a connect gets stuck (e.g. on a security check that never finishes):</p>
        <ul style={list}>
          <li>
            The account must be an Instagram <strong>professional</strong> account
            (Business or Creator). Personal Instagram accounts can&rsquo;t be connected.
          </li>
          <li>
            Open PostProofer in a normal <strong>desktop browser</strong> — not an
            in-app / embedded browser — and allow cookies. The Meta security check
            can&rsquo;t complete inside an in-app browser.
          </li>
          <li>
            Log into the correct Facebook / Instagram account <strong>first</strong>,
            then click Connect — going in cold is what tends to stall.
          </li>
          <li>
            While we&rsquo;re still in testing with Meta, the account has to be added
            as a <strong>tester</strong> on our app first (ask your admin). Any account
            works once Meta&rsquo;s app review is approved.
          </li>
          <li>
            A Facebook Page owned by a Business Portfolio / on the New Pages Experience
            may show &ldquo;No Pages to control&rdquo; — grant our app access to the Page
            in Meta Business Settings, then retry.
          </li>
        </ul>
      </div>
    </details>
  );
}

const wrap: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #e4e4e7",
  borderRadius: 12,
  padding: "10px 14px",
};
const summary: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: "#3f3f46",
  cursor: "pointer",
  listStyle: "revert",
};
const body: React.CSSProperties = {
  marginTop: 10,
  fontSize: 13,
  color: "#3f3f46",
  lineHeight: 1.55,
};
const note: React.CSSProperties = {
  margin: "0 0 10px",
  padding: "8px 10px",
  background: "#fff7ed",
  border: "1px solid #fed7aa",
  borderRadius: 8,
  color: "#9a3412",
};
const lead: React.CSSProperties = { margin: "0 0 6px", fontWeight: 600 };
const list: React.CSSProperties = {
  margin: 0,
  paddingLeft: 18,
  display: "flex",
  flexDirection: "column",
  gap: 6,
};
