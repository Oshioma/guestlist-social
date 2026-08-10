// Editable legal pages: registry of defaults + types. Pure module (no server
// imports) so it can be used from both the public pages and the Super admin
// editor. Adding a page here (plus a route that renders it) makes it editable.
//
// The default bodies below are written to satisfy Meta App Review (they name the
// Facebook/Instagram data the app touches, how tokens are handled, and how a
// person deletes their data). Edit the live copy from Super admin → Legal; these
// are only the fallback used until an override is saved.

export type LegalPageKey = "privacy" | "data_deletion" | "terms";

export type LegalPageDef = {
  key: LegalPageKey;
  // Route slug and nav label.
  slug: string;
  navLabel: string;
  defaultTitle: string;
  defaultBodyHtml: string;
};

// Change these to your real details, or edit the live copy in Super admin → Legal.
const CONTACT_EMAIL = "nelly@guestlistsocial.com";
const APP_NAME = "Post Proofer";
// The operating company behind the product.
const COMPANY = "Guestlist Social";

export const LEGAL_PAGES: LegalPageDef[] = [
  {
    key: "privacy",
    slug: "privacy",
    navLabel: "Privacy Policy",
    defaultTitle: "Privacy Policy",
    defaultBodyHtml: `
<p><em>Last updated: 9 August 2026</em></p>

<p>${APP_NAME} ("we", "us") helps businesses and agencies plan, approve and publish
social-media posts to their own Instagram and Facebook accounts. This policy
explains what we collect, how we use it, and your choices. Questions:
<a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>.</p>

<h2>Information we collect</h2>
<ul>
  <li><strong>Account details</strong> — your email address and, if provided, your name, so you can sign in and we can contact you.</li>
  <li><strong>Content you create</strong> — the captions, images, videos and schedules you add to plan your posts.</li>
  <li><strong>Connected social accounts (Meta)</strong> — when you connect a Facebook Page and its linked Instagram Business account, we receive the account's ID and username, the list of Pages you manage, and an access token that lets us act on your behalf. We also read post and account <strong>insights</strong> for accounts you connect, to show you performance.</li>
  <li><strong>Usage data</strong> — basic logs (e.g. errors, timestamps) needed to run and secure the service.</li>
</ul>

<h2>How we use Meta (Facebook & Instagram) data</h2>
<p>We use the permissions you grant <strong>only</strong> to provide features you ask for:</p>
<ul>
  <li>Publish the specific posts you have created and approved, to the accounts you connected, at the times you scheduled.</li>
  <li>Show which account a post will go to, and confirm the correct Page/Instagram account is linked.</li>
  <li>Show insights (reach, engagement) for your own published posts.</li>
</ul>
<p>We do <strong>not</strong> sell your data, use it for advertising, or share Meta data with third parties for their own purposes. We do not post anything you have not created and approved. Access tokens are stored encrypted on our servers and are never shown to other members of your team.</p>

<h2>Who we share it with</h2>
<p>We use a small number of service providers ("subprocessors") purely to run the product, under contract and only for that purpose:</p>
<ul>
  <li><strong>Supabase</strong> — database and authentication.</li>
  <li><strong>Vercel</strong> — application hosting.</li>
  <li><strong>Resend</strong> — sending transactional email (invites, review digests).</li>
  <li><strong>Anthropic</strong> — optional AI features you trigger (e.g. caption suggestions).</li>
  <li><strong>Meta</strong> — to publish your content and read your insights, as above.</li>
</ul>
<p>We may also disclose information if required by law.</p>

<h2>How long we keep it</h2>
<p>We keep your data while your account is active. When you delete your account (or an account/team), we delete the associated content, connected-account records and access tokens. See <a href="/data-deletion">Data Deletion</a>. Some minimal logs may be retained briefly for security and then removed.</p>

<h2>Your choices and rights</h2>
<ul>
  <li>Disconnect a social account at any time in the app, which removes our stored token for it.</li>
  <li>Request access to, correction of, or deletion of your data by emailing <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>.</li>
  <li>Revoke our access from Meta directly: Facebook → Settings &amp; Privacy → Settings → Business Integrations, or Instagram → Settings → Apps and Websites.</li>
</ul>

<h2>Security</h2>
<p>We use industry-standard measures (encryption in transit, access controls, server-side token storage) to protect your data. No system is perfectly secure, but we work to keep yours safe.</p>

<h2>Children</h2>
<p>${APP_NAME} is for businesses and is not directed to children. Do not use it if you are under 18.</p>

<h2>Changes</h2>
<p>We may update this policy; we'll change the "last updated" date above and, for material changes, notify you.</p>

<h2>Contact</h2>
<p>Email <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a> with any privacy questions or requests.</p>
`.trim(),
  },
  {
    key: "data_deletion",
    slug: "data-deletion",
    navLabel: "Data Deletion",
    defaultTitle: "Data Deletion",
    defaultBodyHtml: `
<p><em>Last updated: 9 August 2026</em></p>

<p>You can delete your data from ${APP_NAME} at any time. This page explains how,
and what gets removed. If you have any trouble, email
<a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a> and we'll handle it for you.</p>

<h2>Delete your account and all its data</h2>
<p>Email <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a> from the address you signed up with, with the subject <strong>"Delete my data"</strong>. We will permanently delete:</p>
<ul>
  <li>your account and profile,</li>
  <li>the teams and accounts you own,</li>
  <li>the posts, captions, media and schedules you created,</li>
  <li>and all connected-account records and Meta (Facebook/Instagram) access tokens.</li>
</ul>
<p>We complete deletion within <strong>30 days</strong> and confirm by email.</p>

<h2>Disconnect a single social account</h2>
<p>To remove just one connected Instagram/Facebook account (and the token we hold for it) without deleting your whole account, open the account in ${APP_NAME} and choose <strong>Disconnect</strong>. The stored token is deleted immediately.</p>

<h2>Revoke access from Meta's side</h2>
<p>You can also revoke our access directly with Meta at any time:</p>
<ul>
  <li><strong>Facebook:</strong> Settings &amp; Privacy → Settings → Business Integrations → select ${APP_NAME} → Remove.</li>
  <li><strong>Instagram:</strong> Settings → Apps and Websites → remove ${APP_NAME}.</li>
</ul>
<p>Revoking there invalidates the token immediately; email us if you'd also like the associated records removed from our database.</p>

<h2>Contact</h2>
<p><a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a> — we respond to deletion requests within 30 days.</p>
`.trim(),
  },
  {
    key: "terms",
    slug: "terms",
    navLabel: "Terms & Conditions",
    defaultTitle: "Terms & Conditions",
    defaultBodyHtml: `
<p><em>Last updated: 9 August 2026</em></p>

<p>These Terms &amp; Conditions ("Terms") govern your use of ${APP_NAME} (the
"Service"), operated by ${COMPANY} ("we", "us"). By creating an account or using
the Service, you agree to these Terms. If you don't agree, don't use the Service.
Questions: <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>.</p>

<h2>1. The Service</h2>
<p>${APP_NAME} lets businesses and agencies plan, draft, approve and publish
social-media posts to their own connected Instagram and Facebook accounts, and
view basic performance insights.</p>

<h2>2. Your account</h2>
<p>You must give accurate information, keep your login secure, and are responsible
for all activity under your account. You must be at least 18 and have authority to
accept these Terms (including on behalf of any business you represent).</p>

<h2>3. Connecting social accounts</h2>
<p>When you connect a Facebook Page and its linked Instagram account, you authorise
us to publish the content you create and schedule, and to read insights, on your
behalf. You confirm you have the right to manage and post to those accounts, and you
agree to comply with Meta's terms and the Instagram and Facebook platform policies.
Your use of Meta's services is also governed by Meta's own terms.</p>

<h2>4. Your content</h2>
<p>You keep ownership of the content you upload and create. You grant us a limited
licence to store, process and publish that content solely to provide the Service
(for example, to publish it to the accounts you connect). You are responsible for
your content and must not post anything unlawful, infringing, deceptive, or that
violates a third party's rights or a platform's rules.</p>

<h2>5. Acceptable use</h2>
<p>You agree not to: use the Service for spam or bulk unsolicited content; break the
law or any platform policy; infringe intellectual-property or privacy rights; attempt
to disrupt, reverse-engineer, or gain unauthorised access to the Service; or resell
the Service without our permission.</p>

<h2>6. Plans, trials and billing</h2>
<p>Some features are offered on paid plans. Paid plans may start with a free trial;
unless cancelled before the trial ends, they convert to a paid subscription. Fees are
billed in advance and are non-refundable except where required by law. We may change
plan pricing on reasonable notice. You can cancel at any time, effective at the end of
the current billing period.</p>

<h2>7. Third-party services</h2>
<p>The Service relies on third parties (including Meta, and our hosting, database and
email providers). We are not responsible for their availability or actions, and your
use of them may be subject to their own terms.</p>

<h2>8. Availability and changes</h2>
<p>We aim to keep the Service available but do not guarantee it will be uninterrupted or
error-free. We may add, change, suspend or discontinue features at any time.</p>

<h2>9. Disclaimers</h2>
<p>The Service is provided "as is" and "as available", without warranties of any kind to
the fullest extent permitted by law. We do not warrant that publishing will always
succeed, as this depends on third-party platforms outside our control.</p>

<h2>10. Limitation of liability</h2>
<p>To the fullest extent permitted by law, ${COMPANY} will not be liable for any
indirect, incidental, special or consequential losses, or for lost profits, revenue,
data or goodwill. Our total liability for any claim relating to the Service will not
exceed the amount you paid us in the 12 months before the claim.</p>

<h2>11. Indemnity</h2>
<p>You agree to indemnify ${COMPANY} against claims arising from your content, your use
of the Service, or your breach of these Terms or of a platform's policies.</p>

<h2>12. Termination</h2>
<p>You may stop using the Service and delete your account at any time (see
<a href="/data-deletion">Data Deletion</a>). We may suspend or terminate access if you
breach these Terms or use the Service in a way that risks harm to others or to the
platforms we integrate with.</p>

<h2>13. Governing law</h2>
<p>These Terms are governed by the laws of England and Wales, and the courts of England
and Wales have exclusive jurisdiction, unless mandatory local law provides otherwise.</p>

<h2>14. Changes to these Terms</h2>
<p>We may update these Terms from time to time; we'll change the "last updated" date above
and, for material changes, take reasonable steps to notify you. Continued use after a change
means you accept the updated Terms.</p>

<h2>15. Contact</h2>
<p><a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a></p>
`.trim(),
  },
];

export function getLegalDef(key: string): LegalPageDef | undefined {
  return LEGAL_PAGES.find((p) => p.key === key);
}

export function getLegalDefBySlug(slug: string): LegalPageDef | undefined {
  return LEGAL_PAGES.find((p) => p.slug === slug);
}

export type LegalPageValues = { title: string; bodyHtml: string };

export function defaultLegalValues(def: LegalPageDef): LegalPageValues {
  return { title: def.defaultTitle, bodyHtml: def.defaultBodyHtml };
}
