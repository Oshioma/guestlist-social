import "server-only";

// ---------------------------------------------------------------------------
// Review digest email.
//
// When the operator hits "Send for client review" on a draft review, we
// flip the row to `sent` and then ping every linked portal user with a
// short, calm email containing the headline + a deep link into the portal.
//
// The email is intentionally minimal: we want clients to actually click,
// not to skim the whole review inside Gmail. The body is the cover block
// only — period label, headline, subhead, button.
//
// Recipient resolution: client_user_links → auth.admin.getUserById per
// linked auth user. We don't paginate via listUsers because the link table
// is the source of truth for "who should receive this", and getUserById is
// O(1) per row instead of scanning the full auth pool.
//
// Failure handling: never throws. The caller awaits the result and logs it,
// but a transport failure must not roll back the underlying status flip —
// the operator can resend manually if needed.
// ---------------------------------------------------------------------------

import { createClient } from "@supabase/supabase-js";
import { sendEmail, type SendEmailResult } from "@/lib/email";

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env vars");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// Resolve the public-facing base URL for portal links. Mirrors the pattern
// already used in app/api/run-pipeline: explicit env var first, then Vercel
// default, then a sensible localhost fallback for dev.
function getAppBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ??
    "http://localhost:3000"
  );
}

export type SendReviewDigestResult = {
  reviewId: number;
  recipients: number;
  sent: number;
  skipped: number;
  failed: number;
  details: SendEmailResult[];
};

type ReviewRow = {
  id: number;
  client_id: number;
  period_label: string | null;
  headline: string | null;
  subhead: string | null;
  share_token: string | null;
  status: string;
};

type ClientRow = { id: number; name: string | null };

export async function sendReviewDigest(
  reviewId: number
): Promise<SendReviewDigestResult> {
  const supabase = admin();

  // 1. Pull the review + parent client.
  const { data: reviewRow, error: revErr } = await supabase
    .from("reviews")
    .select(
      "id, client_id, period_label, headline, subhead, share_token, status"
    )
    .eq("id", reviewId)
    .single();
  if (revErr || !reviewRow) {
    throw new Error(revErr?.message ?? "Review not found");
  }
  const review = reviewRow as ReviewRow;

  const { data: clientRow } = await supabase
    .from("clients")
    .select("id, name")
    .eq("id", review.client_id)
    .single();
  const client = (clientRow ?? null) as ClientRow | null;

  // 2. Find every auth user linked to this client.
  const { data: links, error: linkErr } = await supabase
    .from("client_user_links")
    .select("auth_user_id")
    .eq("client_id", review.client_id);
  if (linkErr) {
    throw new Error(`client_user_links: ${linkErr.message}`);
  }
  const authIds = (links ?? []).map((r: any) => String(r.auth_user_id));

  if (authIds.length === 0) {
    return {
      reviewId,
      recipients: 0,
      sent: 0,
      skipped: 0,
      failed: 0,
      details: [],
    };
  }

  // 3. Resolve emails. getUserById is O(1) per row — fine for the typical
  // client (1-3 portal users). If a user has no email on file we drop them.
  const emails: string[] = [];
  for (const id of authIds) {
    try {
      const { data, error } = await supabase.auth.admin.getUserById(id);
      if (error) {
        console.warn("[review-email] getUserById failed", id, error.message);
        continue;
      }
      const email = data.user?.email ?? null;
      if (email) emails.push(email);
    } catch (e) {
      console.warn("[review-email] getUserById threw", id, e);
    }
  }

  if (emails.length === 0) {
    return {
      reviewId,
      recipients: 0,
      sent: 0,
      skipped: 0,
      failed: 0,
      details: [],
    };
  }

  // 4. Build the email body. One send per recipient so a single bad address
  // doesn't poison the rest.
  const baseUrl = getAppBaseUrl();
  const portalUrl = `${baseUrl}/portal/${review.client_id}/reviews/${review.id}`;
  const shareUrl = review.share_token
    ? `${baseUrl}/r/${review.share_token}`
    : null;

  const periodLabel = review.period_label ?? "Latest review";
  const headline = review.headline ?? "Your latest update is ready";
  const subhead =
    review.subhead ??
    "We've put together a short summary of what's been happening on your ads.";
  const clientName = client?.name ?? "your account";

  const subject = `${periodLabel} — ${headline}`;
  const html = renderDigestHtml({
    periodLabel,
    headline,
    subhead,
    clientName,
    portalUrl,
    shareUrl,
  });
  const text = renderDigestText({
    periodLabel,
    headline,
    subhead,
    clientName,
    portalUrl,
    shareUrl,
  });

  const details: SendEmailResult[] = [];
  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const to of emails) {
    const result = await sendEmail({ to, subject, html, text });
    details.push(result);
    if (result.ok) sent += 1;
    else if (result.skipped) skipped += 1;
    else failed += 1;
  }

  return {
    reviewId,
    recipients: emails.length,
    sent,
    skipped,
    failed,
    details,
  };
}

// ---------------------------------------------------------------------------
// Templates. Inline styles only — every email client strips <style> blocks
// or scopes them in surprising ways. The palette mirrors the portal cover
// block: warm white background, navy headline, slate body, sage CTA.
// ---------------------------------------------------------------------------

type TemplateInput = {
  periodLabel: string;
  headline: string;
  subhead: string;
  clientName: string;
  portalUrl: string;
  shareUrl: string | null;
};

function renderDigestHtml(t: TemplateInput): string {
  // The share URL is the fallback for clients who haven't logged into the
  // portal yet — it skips auth. We surface it as a small secondary link so
  // it's there if needed but doesn't compete with the primary CTA.
  const fallbackLine = t.shareUrl
    ? `<p style="margin:18px 0 0;font-size:12px;color:#94a3b8;line-height:1.5;">
         Trouble signing in? <a href="${escapeAttr(t.shareUrl)}" style="color:#64748b;">Open without an account →</a>
       </p>`
    : "";

  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#fafaf9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1e293b;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fafaf9;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border:1px solid #e7e5e4;border-radius:16px;overflow:hidden;">
            <tr>
              <td style="padding:32px 32px 8px;">
                <div style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#94a3b8;">
                  ${escapeHtml(t.periodLabel)}
                </div>
                <h1 style="margin:10px 0 0;font-size:24px;line-height:1.2;font-weight:700;letter-spacing:-0.02em;color:#1e293b;">
                  ${escapeHtml(t.headline)}
                </h1>
                <p style="margin:14px 0 0;font-size:15px;line-height:1.55;color:#475569;">
                  ${escapeHtml(t.subhead)}
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 32px 32px;">
                <a href="${escapeAttr(t.portalUrl)}"
                   style="display:inline-block;background:#1e293b;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 20px;border-radius:10px;">
                  Read the full review →
                </a>
                ${fallbackLine}
              </td>
            </tr>
            <tr>
              <td style="padding:18px 32px 28px;border-top:1px solid #f1f5f9;">
                <p style="margin:0;font-size:12px;color:#94a3b8;line-height:1.5;">
                  Sent for ${escapeHtml(t.clientName)}. You're receiving this because you're listed as a contact for this account.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function renderDigestText(t: TemplateInput): string {
  const lines = [
    t.periodLabel,
    "",
    t.headline,
    "",
    t.subhead,
    "",
    `Read the full review: ${t.portalUrl}`,
  ];
  if (t.shareUrl) {
    lines.push("");
    lines.push(`Trouble signing in? Open without an account: ${t.shareUrl}`);
  }
  lines.push("");
  lines.push(`Sent for ${t.clientName}.`);
  return lines.join("\n");
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
