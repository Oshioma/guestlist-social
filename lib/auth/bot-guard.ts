// Cheap, no-infra bot signals for public forms. Neither is a strong defence on
// its own — they sit in front of Turnstile + rate limiting to shed the large
// volume of unsophisticated bots before those layers do any work.

// Name of the honeypot field. It's a real-looking input positioned off-screen
// (see .hp-field in auth.css) and marked aria-hidden with tabIndex -1, so a
// human never sees or tabs into it. Bots that blindly fill every field trip it.
export const HONEYPOT_FIELD = "company";

// Hidden field carrying the server-render timestamp (ms). Compared against the
// server clock on submit — because it's stamped and checked server-side there's
// no client/server clock skew to worry about.
export const FORM_TS_FIELD = "form_ts";

// A real person can't read the form and submit in under this long. Anything
// faster is a script. Kept lenient to avoid false positives on password
// managers / autofill.
const MIN_FILL_MS = 2000;

// Returns true when the submission looks like a bot: the honeypot was filled,
// or it arrived implausibly fast after render. Callers should treat a trip as a
// silent, generic rejection — don't tell the bot which signal caught it.
export function looksLikeBot(formData: FormData): boolean {
  const honeypot = (formData.get(HONEYPOT_FIELD) as string | null)?.trim();
  if (honeypot) return true;

  const rendered = Number(formData.get(FORM_TS_FIELD));
  if (Number.isFinite(rendered) && rendered > 0) {
    const elapsed = Date.now() - rendered;
    // Too fast → bot. A wildly future timestamp (elapsed < 0) is tampering.
    if (elapsed < MIN_FILL_MS) return true;
  }

  return false;
}
