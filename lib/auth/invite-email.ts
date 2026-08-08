import "server-only";

// ---------------------------------------------------------------------------
// Team-invite email.
//
// Sent through our own Resend transport (lib/email) rather than Supabase's
// built-in, rate-limited auth mailer. The link is a verifyOtp confirmation
// URL pointing at /auth/callback?token_hash=…&type=invite — the same path
// every other auth email in the app uses — so clicking it establishes the
// SSR session and lands the invitee on /accept-invite to set a password.
//
// Inline styles only: every email client strips <style> blocks or scopes
// them unpredictably. Palette mirrors the review digest (warm white, navy
// headline, slate body, navy CTA) so the two emails feel like one product.
// ---------------------------------------------------------------------------

export type InviteEmailContent = {
  subject: string;
  html: string;
  text: string;
};

export function renderInviteEmail(
  acceptLink: string,
  teamName?: string
): InviteEmailContent {
  const where = teamName ? `the “${teamName}” team on Post Proofer` : "Post Proofer";
  const subject = teamName
    ? `You're invited to ${teamName} on Post Proofer`
    : "You're invited to Post Proofer";

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#fafaf9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1e293b;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fafaf9;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border:1px solid #e7e5e4;border-radius:16px;overflow:hidden;">
            <tr>
              <td style="padding:32px 32px 8px;">
                <div style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#94a3b8;">
                  Invitation
                </div>
                <h1 style="margin:10px 0 0;font-size:24px;line-height:1.2;font-weight:700;letter-spacing:-0.02em;color:#1e293b;">
                  You've been invited
                </h1>
                <p style="margin:14px 0 0;font-size:15px;line-height:1.55;color:#475569;">
                  You've been invited to join ${escapeHtml(where)}. Click below to set your password and get started.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 32px 32px;">
                <a href="${escapeAttr(acceptLink)}"
                   style="display:inline-block;background:#1e293b;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 20px;border-radius:10px;">
                  Accept invitation →
                </a>
                <p style="margin:18px 0 0;font-size:12px;color:#94a3b8;line-height:1.5;">
                  If the button doesn't work, copy and paste this link into your browser:<br />
                  <a href="${escapeAttr(acceptLink)}" style="color:#64748b;word-break:break-all;">${escapeHtml(acceptLink)}</a>
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 32px 28px;border-top:1px solid #f1f5f9;">
                <p style="margin:0;font-size:12px;color:#94a3b8;line-height:1.5;">
                  If you weren't expecting this invitation you can safely ignore this email.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = [
    "You've been invited",
    "",
    `You've been invited to join ${where}.`,
    "",
    `Accept your invitation and set a password: ${acceptLink}`,
    "",
    "If you weren't expecting this invitation you can safely ignore this email.",
  ].join("\n");

  return { subject, html, text };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s);
}
