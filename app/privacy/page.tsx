import type { Metadata } from "next";
import Link from "next/link";

// Privacy policy page. Rendered as a plain server component with inline
// styles so it stays readable even without the marketing homepage's
// Tailwind classes being available. Linked from the global footer on the
// root page, and surfaced publicly at https://guestlistsocial.com/privacy
// — this URL is what we give Meta/Facebook as the app's Privacy Policy
// URL in the app dashboard (required for Facebook Login to be available).

export const metadata: Metadata = {
  title: "Privacy Policy — Guestlist Social",
  description:
    "How Guestlist Social collects, uses, and protects your information when you use our content and social publishing tools.",
};

export default function PrivacyPolicyPage() {
  return (
    <main
      style={{
        background: "#000",
        color: "#fff",
        minHeight: "100vh",
        padding: "64px 20px",
        fontFamily:
          "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif",
        lineHeight: 1.6,
      }}
    >
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <Link
          href="/"
          style={{
            display: "inline-block",
            color: "rgba(255,255,255,0.6)",
            textDecoration: "none",
            fontSize: 13,
            marginBottom: 32,
          }}
        >
          ← Back to Guestlist Social
        </Link>

        <h1
          style={{
            fontSize: 40,
            fontWeight: 800,
            letterSpacing: "-0.02em",
            margin: "0 0 12px",
          }}
        >
          Privacy Policy
        </h1>

        <p
          style={{
            fontSize: 13,
            color: "rgba(255,255,255,0.55)",
            margin: "0 0 40px",
          }}
        >
          Effective Date: 1 April 2026 · Last Updated: 13 April 2026
        </p>

        <Section title="1. Introduction">
          <p>
            Welcome to Guestlist Social. We provide content and tools that
            allow users to create, manage, and schedule content and adverts
            across social media platforms. Your privacy is important to us,
            and this Privacy Policy explains how we collect, use, and protect
            your information.
          </p>
          <p>
            By using our app, you agree to the collection and use of
            information in accordance with this policy.
          </p>
        </Section>

        <Section title="2. Information We Collect">
          <h3 style={subheadingStyle}>2.1 Information You Provide</h3>
          <p>We may collect the following information when you use our app:</p>
          <ul style={listStyle}>
            <li>Name and email address</li>
            <li>Account login details</li>
            <li>
              Social media account connections (e.g., Facebook, Instagram,
              etc.)
            </li>
            <li>Content you create, upload, or schedule</li>
            <li>Messages or support requests you send us</li>
          </ul>

          <h3 style={subheadingStyle}>2.2 Information from Connected Platforms</h3>
          <p>
            When you connect third-party platforms (such as
            Meta/Facebook/Instagram), we may collect:
          </p>
          <ul style={listStyle}>
            <li>Public profile information</li>
            <li>Page or account IDs</li>
            <li>Access tokens (securely stored)</li>
            <li>Ad account or page insights (if permissions are granted)</li>
          </ul>
          <p>We only access data necessary to provide our services.</p>

          <h3 style={subheadingStyle}>2.3 Automatically Collected Information</h3>
          <p>We may automatically collect:</p>
          <ul style={listStyle}>
            <li>Device type and browser</li>
            <li>IP address</li>
            <li>Usage data (features used, actions taken)</li>
            <li>Log data and performance metrics</li>
          </ul>
        </Section>

        <Section title="3. How We Use Your Information">
          <p>We use your information to:</p>
          <ul style={listStyle}>
            <li>Provide and operate the app</li>
            <li>Schedule and publish content on your behalf</li>
            <li>Improve performance and user experience</li>
            <li>Generate insights and recommendations</li>
            <li>Communicate with you (support, updates)</li>
            <li>Ensure security and prevent misuse</li>
          </ul>
          <p>We do not sell your personal data.</p>
        </Section>

        <Section title="4. Data Sharing and Disclosure">
          <p>We may share your data only in the following cases:</p>
          <ul style={listStyle}>
            <li>
              With third-party platforms (e.g., Meta) to perform scheduled
              actions
            </li>
            <li>
              With service providers (hosting, analytics, email services)
            </li>
            <li>If required by law or legal process</li>
            <li>To protect our rights, users, or platform integrity</li>
          </ul>
        </Section>

        <Section title="5. Data Storage and Security">
          <p>We take reasonable steps to protect your data, including:</p>
          <ul style={listStyle}>
            <li>Secure storage of access tokens</li>
            <li>Encryption where appropriate</li>
            <li>Restricted internal access</li>
          </ul>
          <p>However, no system is 100% secure.</p>
        </Section>

        <Section title="6. Your Rights and Control">
          <p>You have the right to:</p>
          <ul style={listStyle}>
            <li>Access your data</li>
            <li>Update or delete your account</li>
            <li>Disconnect social media accounts</li>
            <li>Request data deletion</li>
          </ul>
          <p>
            To request deletion, contact:{" "}
            <a href="mailto:nelly@guestlistsocial.com" style={linkStyle}>
              nelly@guestlistsocial.com
            </a>
          </p>
        </Section>

        <Section title="7. Data Retention">
          <p>We retain your data only as long as necessary to:</p>
          <ul style={listStyle}>
            <li>Provide our services</li>
            <li>Comply with legal obligations</li>
            <li>Resolve disputes</li>
          </ul>
          <p>You may request deletion at any time.</p>
        </Section>

        <Section title="8. Third-Party Services">
          <p>
            Our app integrates with third-party platforms. Their privacy
            policies apply when you use their services:
          </p>
          <ul style={listStyle}>
            <li>Facebook / Instagram (Meta)</li>
            <li>Other connected platforms</li>
          </ul>
          <p>We are not responsible for third-party practices.</p>
        </Section>

        <Section title="9. Children's Privacy">
          <p>
            Our service is not intended for individuals under 13 (or the
            relevant age in your jurisdiction). We do not knowingly collect
            data from children.
          </p>
        </Section>

        <Section title="10. Changes to This Policy">
          <p>
            We may update this Privacy Policy from time to time. Updates will
            be posted within the app or on our website.
          </p>
        </Section>

        <Section title="11. Contact Us">
          <p>
            If you have questions or requests regarding this policy, contact:
          </p>
          <ul style={listStyle}>
            <li>
              Email:{" "}
              <a href="mailto:nelly@guestlistsocial.com" style={linkStyle}>
                nelly@guestlistsocial.com
              </a>
            </li>
            <li>Company: Guestlist Social</li>
          </ul>
        </Section>

        <Section title="12. Platform-Specific Compliance">
          <p>
            If you connect social media accounts (e.g., Meta), we comply with
            platform requirements, including:
          </p>
          <ul style={listStyle}>
            <li>Only accessing data necessary for functionality</li>
            <li>Not storing or sharing data beyond permitted use</li>
            <li>Providing a clear data deletion mechanism</li>
            <li>
              For Meta data deletion requests, users can contact Meta directly
            </li>
          </ul>
        </Section>

        <div
          style={{
            borderTop: "1px solid rgba(255,255,255,0.1)",
            marginTop: 48,
            paddingTop: 24,
            fontSize: 12,
            color: "rgba(255,255,255,0.4)",
          }}
        >
          © {new Date().getFullYear()} Guestlist Social. All rights reserved.
        </div>
      </div>
    </main>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section style={{ margin: "36px 0" }}>
      <h2
        style={{
          fontSize: 20,
          fontWeight: 700,
          letterSpacing: "-0.01em",
          margin: "0 0 12px",
          color: "#fff",
        }}
      >
        {title}
      </h2>
      <div style={{ color: "rgba(255,255,255,0.75)", fontSize: 15 }}>
        {children}
      </div>
    </section>
  );
}

const subheadingStyle: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 700,
  color: "rgba(255,255,255,0.9)",
  margin: "20px 0 8px",
};

const listStyle: React.CSSProperties = {
  margin: "8px 0 16px",
  paddingLeft: 20,
};

const linkStyle: React.CSSProperties = {
  color: "#60a5fa",
  textDecoration: "underline",
};
