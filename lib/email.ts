// ---------------------------------------------------------------------------
// Tiny email transport.
//
// Resend's HTTP API directly via fetch — no SDK dependency, no extra package.
// Gated on RESEND_API_KEY so a developer running locally without an email
// account doesn't get crashes when "Send for client review" is clicked. The
// caller can inspect the returned status to decide whether to surface a UI
// note ("email skipped — no provider configured").
//
// The shape is intentionally provider-agnostic: if we ever swap to Postmark
// or SES, every call site can stay the same and only this file changes.
// ---------------------------------------------------------------------------

import "server-only";

export type SendEmailInput = {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
};

export type SendEmailResult =
  | { ok: true; provider: "resend"; id: string }
  | { ok: false; skipped: true; reason: string }
  | { ok: false; skipped: false; error: string };

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;

  // Soft-skip path: if either env var is missing, we don't crash. This lets
  // local dev and CI run the rest of the flow without standing up an account.
  // The caller can choose to surface this in the UI.
  if (!apiKey) {
    console.warn("[email] RESEND_API_KEY not set — skipping send", {
      to: input.to,
      subject: input.subject,
    });
    return { ok: false, skipped: true, reason: "RESEND_API_KEY not set" };
  }
  if (!from) {
    console.warn("[email] EMAIL_FROM not set — skipping send", {
      to: input.to,
      subject: input.subject,
    });
    return { ok: false, skipped: true, reason: "EMAIL_FROM not set" };
  }

  const recipients = Array.isArray(input.to) ? input.to : [input.to];
  if (recipients.length === 0) {
    return { ok: false, skipped: true, reason: "no recipients" };
  }

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: recipients,
        subject: input.subject,
        html: input.html,
        text: input.text,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error("[email] Resend rejected send", res.status, body);
      return {
        ok: false,
        skipped: false,
        error: `Resend ${res.status}: ${body.slice(0, 200)}`,
      };
    }

    const json = (await res.json()) as { id?: string };
    return { ok: true, provider: "resend", id: json.id ?? "" };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[email] Network error sending", message);
    return { ok: false, skipped: false, error: message };
  }
}
