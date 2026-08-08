// ---------------------------------------------------------------------------
// Pure email-template rendering. No DB, no server-only imports — safe to use
// from both the server (real sends) and the client (the Super admin editor's
// live preview), so what the owner previews is exactly what recipients get.
//
// A template is: a subject line, a rich-text body (HTML the owner authored in
// the editor), and an optional CTA button label. Dynamic values are injected
// with {{token}} placeholders. The body is wrapped in a fixed "chrome" (the
// card + the CTA button) so the functional link can never be edited into a
// broken state — the owner controls the words, the app controls the wiring.
// ---------------------------------------------------------------------------

export type EmailPlaceholder = {
  token: string;
  label: string;
  sample: string;
};

export type EmailTemplateDef = {
  key: string;
  name: string;
  description: string;
  // Which placeholder token supplies the CTA button's href. null = no button.
  primaryLinkVar: string | null;
  defaultSubject: string;
  defaultBodyHtml: string;
  defaultButtonLabel: string | null;
  placeholders: EmailPlaceholder[];
};

export type EmailTemplateValues = {
  subject: string;
  bodyHtml: string;
  buttonLabel: string | null;
};

export type RenderedEmail = { subject: string; html: string; text: string };

// ── Registry: every email the site sends ────────────────────────────────────
// Adding an email here (plus a renderEmailTemplate call at its send site) makes
// it editable in the Super admin → Emails tab automatically.

export const EMAIL_TEMPLATES: EmailTemplateDef[] = [
  {
    key: "invite",
    name: "Team invite",
    description:
      "Sent when you invite someone to a team, or to their own team from this page.",
    primaryLinkVar: "accept_link",
    defaultSubject: "You're invited to {{team_name}}",
    defaultButtonLabel: "Accept invitation →",
    defaultBodyHtml:
      `<p style="font-size:20px;font-weight:700;color:#1e293b;margin:0 0 12px;">You've been invited</p>` +
      `<p style="font-size:15px;line-height:1.6;color:#475569;margin:0;">You've been invited to join {{team_name}}. Click the button below to set your password and get started.</p>`,
    placeholders: [
      { token: "team_name", label: "Team name", sample: "Acme Studio" },
      {
        token: "accept_link",
        label: "Accept link (button)",
        sample: "https://postproofer.com/auth/callback?token_hash=…&type=invite",
      },
    ],
  },
  {
    key: "review_digest",
    name: "Client review digest",
    description:
      "Sent to a client's contacts when you press “Send for client review”.",
    primaryLinkVar: "portal_url",
    defaultSubject: "{{period_label}} — {{headline}}",
    defaultButtonLabel: "Read the full review →",
    defaultBodyHtml:
      `<p style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#94a3b8;margin:0 0 8px;">{{period_label}}</p>` +
      `<p style="font-size:22px;font-weight:700;color:#1e293b;margin:0 0 12px;">{{headline}}</p>` +
      `<p style="font-size:15px;line-height:1.6;color:#475569;margin:0;">{{subhead}}</p>`,
    placeholders: [
      { token: "period_label", label: "Period label", sample: "August 2026" },
      {
        token: "headline",
        label: "Headline",
        sample: "Your latest update is ready",
      },
      {
        token: "subhead",
        label: "Subhead",
        sample:
          "We've put together a short summary of what's been happening on your ads.",
      },
      { token: "client_name", label: "Client name", sample: "Acme Studio" },
      {
        token: "portal_url",
        label: "Portal link (button)",
        sample: "https://guestlistsocial.com/portal/12/reviews/34",
      },
      {
        token: "share_url",
        label: "Public share link",
        sample: "https://guestlistsocial.com/r/abc123",
      },
    ],
  },
];

export function getTemplateDef(key: string): EmailTemplateDef | undefined {
  return EMAIL_TEMPLATES.find((t) => t.key === key);
}

// ── Substitution + chrome ────────────────────────────────────────────────────

export type TemplateVars = Record<string, string | null | undefined>;

// Replace {{token}} occurrences. When `escape` is true (HTML body / subject
// context) the substituted VALUE is HTML-escaped — the surrounding template
// markup is left intact. Unknown tokens collapse to empty.
export function substituteVars(
  template: string,
  vars: TemplateVars,
  escape: boolean
): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, key: string) => {
    const v = vars[key];
    if (v == null) return "";
    return escape ? escapeHtml(v) : v;
  });
}

// Wrap the authored body in the fixed card + CTA button. The button href is
// supplied by the app (never the owner), so the link can't be broken by edits.
export function wrapEmailChrome(
  bodyHtml: string,
  buttonLabel: string | null,
  buttonHref: string | null
): string {
  const hasButton = Boolean(buttonLabel && buttonHref);
  const bodyPadBottom = hasButton ? "8px" : "32px";
  const button = hasButton
    ? `<tr>
              <td style="padding:16px 32px 32px;">
                <a href="${escapeAttr(buttonHref!)}"
                   style="display:inline-block;background:#1e293b;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 20px;border-radius:10px;">
                  ${escapeHtml(buttonLabel!)}
                </a>
              </td>
            </tr>`
    : "";

  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#fafaf9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1e293b;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fafaf9;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border:1px solid #e7e5e4;border-radius:16px;overflow:hidden;">
            <tr>
              <td style="padding:32px 32px ${bodyPadBottom};">
                ${bodyHtml}
              </td>
            </tr>
            ${button}
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

// Plain-text fallback: substitute (unescaped), strip tags, collapse blank runs,
// then append the button as "Label: href".
export function renderTextBody(
  bodyTemplate: string,
  vars: TemplateVars,
  buttonLabel: string | null,
  buttonHref: string | null
): string {
  const withVars = substituteVars(bodyTemplate, vars, false);
  let text = htmlToText(withVars);
  if (buttonLabel && buttonHref) {
    text += `\n\n${buttonLabel.replace(/\s*→\s*$/, "")}: ${buttonHref}`;
  }
  return text;
}

// Render a full email from raw template values + vars. Used by both the server
// send path and the client preview, so they can never drift.
export function renderEmailFromValues(
  def: EmailTemplateDef,
  values: EmailTemplateValues,
  vars: TemplateVars
): RenderedEmail {
  const subject = substituteVars(values.subject, vars, false).trim();
  const bodyHtml = substituteVars(values.bodyHtml, vars, true);
  const href = def.primaryLinkVar ? vars[def.primaryLinkVar] ?? null : null;
  const html = wrapEmailChrome(bodyHtml, values.buttonLabel, href);
  const text = renderTextBody(values.bodyHtml, vars, values.buttonLabel, href);
  return { subject, html, text };
}

export function defaultValuesFor(def: EmailTemplateDef): EmailTemplateValues {
  return {
    subject: def.defaultSubject,
    bodyHtml: def.defaultBodyHtml,
    buttonLabel: def.defaultButtonLabel,
  };
}

// ── small string helpers ─────────────────────────────────────────────────────

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function escapeAttr(s: string): string {
  return escapeHtml(s);
}

function htmlToText(html: string): string {
  return html
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\/\s*(p|div|h[1-6]|li|tr)\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
