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
import { renderEmailTemplate } from "@/lib/email/templates";

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

  // Subject/body come from the owner-editable template (Super admin → Emails),
  // falling back to the built-in default when no override is stored.
  const { subject, html, text } = await renderEmailTemplate("review_digest", {
    period_label: periodLabel,
    headline,
    subhead,
    client_name: clientName,
    portal_url: portalUrl,
    share_url: shareUrl ?? "",
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
