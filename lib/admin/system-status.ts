import "server-only";

// Super-admin "System" diagnostics: is every important env var / integration
// present and working? Gated on isSuperAdmin.
//
// SECURITY: secret values are NEVER returned — a secret is reported only as
// "Set" / "Not set". Non-secret values (public URLs, app IDs, redirect URIs,
// price IDs, flags) are shown in full so you can eyeball them for typos.

import { createAdminClient } from "@/lib/supabase/admin";
import { isSuperAdmin } from "@/lib/auth/permissions";

export type CheckStatus = "ok" | "warn" | "missing";
export type Check = {
  label: string;
  value: string; // display-safe: a real value, "Set", "Not set", or a live result
  status: CheckStatus;
  hint?: string;
};
export type StatusGroup = {
  name: string;
  description?: string;
  status: CheckStatus; // worst of its checks
  checks: Check[];
};

function present(name: string): boolean {
  const v = process.env[name];
  return typeof v === "string" && v.trim().length > 0;
}

// A secret env var — reveal only whether it's set.
function secret(
  label: string,
  name: string,
  required: boolean
): Check {
  const set = present(name);
  return {
    label,
    value: set ? "Set" : "Not set",
    status: set ? "ok" : required ? "missing" : "warn",
    hint: set ? undefined : required ? `${name} is required` : `${name} (optional)`,
  };
}

// A non-secret env var — show the actual value.
function publicVar(
  label: string,
  name: string,
  required: boolean,
  fallbackNote?: string
): Check {
  const v = process.env[name];
  const set = typeof v === "string" && v.trim().length > 0;
  return {
    label,
    value: set ? v!.trim() : fallbackNote ?? "Not set",
    status: set ? "ok" : required ? "missing" : "warn",
    hint: set ? undefined : required ? `${name} is required` : `${name} (optional)`,
  };
}

function worst(checks: Check[]): CheckStatus {
  if (checks.some((c) => c.status === "missing")) return "missing";
  if (checks.some((c) => c.status === "warn")) return "warn";
  return "ok";
}

function group(name: string, description: string, checks: Check[]): StatusGroup {
  return { name, description, status: worst(checks), checks };
}

// Probe whether a table (and optionally a column) exists, via a HEAD select.
// 42P01 = undefined table, 42703 = undefined column.
async function probeTable(
  admin: ReturnType<typeof createAdminClient>,
  table: string,
  column = "*"
): Promise<{ ok: boolean; detail: string }> {
  try {
    const { error } = await admin.from(table).select(column, { count: "exact", head: true }).limit(1);
    if (!error) return { ok: true, detail: "present" };
    if (error.code === "42P01") return { ok: false, detail: "table missing — run migration" };
    if (error.code === "42703") return { ok: false, detail: "column missing — run migration" };
    return { ok: false, detail: error.message };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : "probe failed" };
  }
}

export async function loadSystemStatus(): Promise<StatusGroup[]> {
  if (!(await isSuperAdmin())) return [];

  const groups: StatusGroup[] = [];

  // Whether anyone can self-register, and whether Turnstile is actually needed.
  const publicSignupOpen =
    (process.env.ENABLE_PUBLIC_SIGNUP ?? "").trim().toLowerCase() === "true";
  const captchaProvider = (process.env.CAPTCHA_PROVIDER ?? "").trim().toLowerCase() || "turnstile";
  const turnstileNeeded = publicSignupOpen && captchaProvider === "turnstile";
  const turnstileKeysSet =
    present("TURNSTILE_SECRET_KEY") && present("NEXT_PUBLIC_TURNSTILE_SITE_KEY");

  // Access first — the most-glanced-at state (is the front door open?).
  groups.push(
    group("Access", "Who's an owner and whether anyone can self-register.", [
      {
        label: "Public sign-up",
        value: publicSignupOpen ? "OPEN — anyone can register" : "Closed (invite-only)",
        status: publicSignupOpen ? "warn" : "ok",
        hint: publicSignupOpen
          ? "Set ENABLE_PUBLIC_SIGNUP=false to close it"
          : "ENABLE_PUBLIC_SIGNUP is not 'true'",
      },
      publicVar("Super-admin emails", "SUPER_ADMIN_EMAILS", false, "oshi@guestlist.net (default)"),
    ])
  );

  // ── Supabase (with a live connectivity check) ──────────────────────────────
  const supabaseChecks: Check[] = [
    publicVar("Project URL", "NEXT_PUBLIC_SUPABASE_URL", true),
    secret("Anon / publishable key", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", true),
    secret("Service-role key", "SUPABASE_SERVICE_ROLE_KEY", true),
  ];
  try {
    const admin = createAdminClient();
    const { error } = await admin.from("teams").select("id", { count: "exact", head: true }).limit(1);
    supabaseChecks.push({
      label: "Live database connection",
      value: error ? `Failed: ${error.message}` : "Connected",
      status: error ? "missing" : "ok",
    });

    // Key migrations — quick presence probes so a lagging migration is obvious.
    const [emailT, legalT, authTypeCol] = await Promise.all([
      probeTable(admin, "email_templates", "key"),
      probeTable(admin, "legal_pages", "key"),
      probeTable(admin, "connected_meta_accounts", "auth_type"),
    ]);
    const migrationChecks: Check[] = [
      { label: "email_templates table", value: emailT.detail, status: emailT.ok ? "ok" : "warn" },
      { label: "legal_pages table", value: legalT.detail, status: legalT.ok ? "ok" : "warn" },
      {
        label: "connected_meta_accounts.auth_type (Instagram login)",
        value: authTypeCol.detail,
        status: authTypeCol.ok ? "ok" : "missing",
      },
    ];
    groups.push(group("Supabase", "Database & authentication.", supabaseChecks));
    groups.push(
      group("Database migrations", "Key tables/columns the newer features rely on.", migrationChecks)
    );
  } catch (e) {
    supabaseChecks.push({
      label: "Live database connection",
      value: `Failed: ${e instanceof Error ? e.message : "unknown"}`,
      status: "missing",
    });
    groups.push(group("Supabase", "Database & authentication.", supabaseChecks));
  }

  // ── App URL ────────────────────────────────────────────────────────────────
  groups.push(
    group("App URL", "Used to build auth + email links.", [
      publicVar("Site URL", "NEXT_PUBLIC_SITE_URL", true),
    ])
  );

  // ── Facebook / Meta connect (publishing via Pages) ─────────────────────────
  groups.push(
    group("Facebook connect (Meta)", "Connect + publish to Instagram/Facebook via a Facebook Page.", [
      publicVar("App ID", "META_SOCIAL_APP_ID", true),
      secret("App secret", "META_SOCIAL_APP_SECRET", true),
      publicVar("OAuth redirect URI", "META_SOCIAL_OAUTH_REDIRECT_URI", true),
      publicVar("Login-for-Business config ID", "META_SOCIAL_LOGIN_CONFIG_ID", false, "Using built-in default"),
    ])
  );

  // ── Instagram Login (native, no Facebook) ──────────────────────────────────
  const igConfigured = present("INSTAGRAM_APP_ID") && present("INSTAGRAM_APP_SECRET") && present("INSTAGRAM_OAUTH_REDIRECT_URI");
  groups.push(
    group(
      "Instagram Login (native)",
      igConfigured
        ? "Enabled — the “Log in with Instagram” buttons are live."
        : "Not enabled — “Log in with Instagram” buttons are hidden until all three are set.",
      [
        publicVar("Instagram App ID", "INSTAGRAM_APP_ID", true),
        secret("Instagram App secret", "INSTAGRAM_APP_SECRET", true),
        publicVar("OAuth redirect URI", "INSTAGRAM_OAUTH_REDIRECT_URI", true),
      ]
    )
  );

  // ── Email (Resend) ─────────────────────────────────────────────────────────
  groups.push(
    group("Email (Resend)", "Sends invites + review digests. Without it, sends are skipped.", [
      secret("Resend API key", "RESEND_API_KEY", true),
      publicVar("From address", "EMAIL_FROM", true),
    ])
  );

  // ── AI (Anthropic) ─────────────────────────────────────────────────────────
  groups.push(
    group("AI (Anthropic)", "Powers caption/idea generation.", [
      secret("Anthropic API key", "ANTHROPIC_API_KEY", true),
    ])
  );

  // ── Ads (Meta Graph) ───────────────────────────────────────────────────────
  groups.push(
    group("Ads sync (Meta Graph)", "Optional — the ads/insights sync.", [
      secret("Meta access token", "META_ACCESS_TOKEN", false),
      publicVar("Meta ad account ID", "META_AD_ACCOUNT_ID", false),
    ])
  );

  // ── Billing (Stripe) ───────────────────────────────────────────────────────
  groups.push(
    group("Billing (Stripe)", "Optional — paid plans. Off if the secret key is unset.", [
      secret("Secret key", "STRIPE_SECRET_KEY", false),
      secret("Webhook secret", "STRIPE_WEBHOOK_SECRET", false),
      publicVar("Pro price ID", "STRIPE_PRICE_PRO", false),
      publicVar("Agency price ID", "STRIPE_PRICE_AGENCY", false),
    ])
  );

  // ── Bot protection ─────────────────────────────────────────────────────────
  // Only a real problem when public sign-up is open AND the provider is
  // turnstile — otherwise unset keys are fine (invites don't use CAPTCHA, and
  // the keyless honeypot/timing/rate-limit layers stay on regardless).
  const turnstileChecks: Check[] = [
    publicVar("Provider", "CAPTCHA_PROVIDER", false, "turnstile (default)"),
  ];
  if (turnstileNeeded) {
    turnstileChecks.push(secret("Turnstile secret key", "TURNSTILE_SECRET_KEY", true));
    turnstileChecks.push(publicVar("Turnstile site key", "NEXT_PUBLIC_TURNSTILE_SITE_KEY", true));
  } else {
    turnstileChecks.push({
      label: "Turnstile keys",
      value: turnstileKeysSet ? "Set" : "Not required",
      status: "ok",
      hint: "Only needed when public sign-up is open with the Turnstile provider",
    });
  }
  groups.push({
    name: "Bot protection (Turnstile)",
    description: turnstileNeeded
      ? "Required now — public sign-up is OPEN with the Turnstile provider, so both keys must be set or sign-up fails."
      : "Not required — public sign-up is closed (or CAPTCHA is off). Keyless protections (honeypot, timing, rate limits) stay on.",
    status: worst(turnstileChecks),
    checks: turnstileChecks,
  });

  // ── Cron ───────────────────────────────────────────────────────────────────
  groups.push(
    group("Scheduled jobs (Cron)", "Auto-publish + token refresh run on Vercel Cron.", [
      secret("Cron secret", "CRON_SECRET", false),
    ])
  );

  return groups;
}
