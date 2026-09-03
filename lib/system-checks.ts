import "server-only";

import { createHash } from "crypto";

/**
 * What is configured, what is broken, and what is only pretending to be set.
 *
 * Every failure this session chased — a missing column, an unset maxDuration,
 * a secret from the wrong app, a placeholder pasted over an app id — was
 * invisible until it broke something in the middle of real work. This puts the
 * whole configuration surface on one page, before it costs anyone an evening.
 *
 * Values are never returned. Presence, length and an 8-character fingerprint
 * are enough to answer "is it set, does it look right, and did my edit reach
 * this deployment?".
 */

export type VarStatus = "ok" | "warn" | "malformed" | "missing";

export type VarReport = {
  name: string;
  status: VarStatus;
  /** Why it matters, in one line. */
  purpose: string;
  /** What is wrong, when something is. */
  note?: string;
  length: number;
  fingerprint: string | null;
  required: boolean;
};

export type GroupReport = {
  group: string;
  blurb: string;
  vars: VarReport[];
};

type Rule = {
  name: string;
  purpose: string;
  required?: boolean;
  /** Return a complaint, or null when the shape is fine. */
  shape?: (value: string) => string | null;
};

const digits = (len: [number, number]) => (v: string) =>
  /^\d+$/.test(v) && v.length >= len[0] && v.length <= len[1]
    ? null
    : `should be ${len[0]}–${len[1]} digits`;

const prefixed = (prefix: string) => (v: string) =>
  v.startsWith(prefix) ? null : `should start with "${prefix}"`;

const httpsUrl = (v: string) => {
  try {
    const u = new URL(v);
    return u.protocol === "https:" ? null : "should be an https URL";
  } catch {
    return "is not a valid URL";
  }
};

const minLength = (n: number) => (v: string) =>
  v.length >= n ? null : `looks too short (${v.length} characters, expected ${n}+)`;

/** Catches a placeholder that was pasted over rather than replaced. */
const PLACEHOLDER = /your[_ -]?|changeme|xxxx|<.*>|example\.com|\s/i;

const GROUPS: { group: string; blurb: string; rules: Rule[] }[] = [
  {
    group: "Core",
    blurb: "Without these the app does not run.",
    rules: [
      { name: "NEXT_PUBLIC_SUPABASE_URL", purpose: "The database and storage endpoint.", required: true, shape: httpsUrl },
      { name: "SUPABASE_SERVICE_ROLE_KEY", purpose: "Server-side database access that bypasses row-level security.", required: true, shape: minLength(40) },
      { name: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", purpose: "Browser-side database access, scoped by row-level security.", required: true, shape: minLength(20) },
      { name: "NEXT_PUBLIC_APP_URL", purpose: "Absolute links in emails and OAuth redirects.", shape: httpsUrl },
      { name: "SUPER_ADMIN_EMAILS", purpose: "Who may reach the super-admin surfaces." },
    ],
  },
  {
    group: "Meta Ads",
    blurb: "Creating campaigns and ads, and switching delivery on.",
    rules: [
      { name: "META_ACCESS_TOKEN", purpose: "Every Graph call the ads side makes.", required: true, shape: minLength(50) },
      { name: "META_APP_SECRET", purpose: "Signs write calls (appsecret_proof). Must belong to the same app as the token.", shape: (v) => (/^[a-f0-9]{32}$/i.test(v) ? null : "should be 32 hex characters") },
      { name: "META_AD_ACCOUNT_ID", purpose: "The ad account campaigns are created in.", required: true, shape: prefixed("act_") },
      { name: "META_APP_ID", purpose: "Not read by any code path — kept only for reference.", shape: digits([15, 17]) },
      { name: "META_EXECUTE_DRY_RUN", purpose: '"false" lets the delivery switch spend real money. Anything else simulates.', shape: (v) => (["true", "false"].includes(v) ? null : 'should be "true" or "false"') },
    ],
  },
  {
    group: "Meta & Instagram publishing",
    blurb: "Connecting accounts and publishing organic posts.",
    rules: [
      { name: "META_SOCIAL_APP_ID", purpose: "The publishing app, separate from the ads app.", shape: digits([15, 17]) },
      { name: "META_SOCIAL_APP_SECRET", purpose: "Publishing app OAuth exchange.", shape: minLength(20) },
      { name: "NEXT_PUBLIC_META_SOCIAL_APP_ID", purpose: "Browser-side Facebook login.", shape: digits([15, 17]) },
      { name: "META_SOCIAL_OAUTH_REDIRECT_URI", purpose: "Where Facebook returns after connecting.", shape: httpsUrl },
      { name: "META_SOCIAL_LOGIN_CONFIG_ID", purpose: "Facebook Login for Business configuration.", shape: digits([10, 20]) },
      { name: "INSTAGRAM_APP_ID", purpose: "Instagram login app.", shape: digits([15, 17]) },
      { name: "INSTAGRAM_APP_SECRET", purpose: "Instagram OAuth exchange.", shape: minLength(20) },
      { name: "INSTAGRAM_OAUTH_REDIRECT_URI", purpose: "Where Instagram returns after connecting.", shape: httpsUrl },
    ],
  },
  {
    group: "AI",
    blurb: "Suggestions, ad copy, post ideas and generated creative.",
    rules: [
      { name: "ANTHROPIC_API_KEY", purpose: "Campaign suggestions, ad copy, post ideas.", required: true, shape: prefixed("sk-ant-") },
      { name: "OPENAI_API_KEY", purpose: "Generated ad images (AI Creative).", shape: prefixed("sk-") },
    ],
  },
  {
    group: "Payments",
    blurb: "Client billing.",
    rules: [
      { name: "STRIPE_SECRET_KEY", purpose: "Checkout and billing portal.", shape: (v) => (v.startsWith("sk_") || v.startsWith("rk_") ? null : 'should start with "sk_" or "rk_"') },
      { name: "STRIPE_WEBHOOK_SECRET", purpose: "Verifies Stripe webhooks.", shape: prefixed("whsec_") },
    ],
  },
  {
    group: "Email & media",
    blurb: "Outbound email, stock imagery, image imports.",
    rules: [
      { name: "RESEND_API_KEY", purpose: "Transactional email.", shape: prefixed("re_") },
      { name: "EMAIL_FROM", purpose: "Sender address on outbound email.", shape: (v) => (v.includes("@") ? null : "should be an email address") },
      { name: "PEXELS_API_KEY", purpose: "Stock image suggestions.", shape: minLength(20) },
      { name: "GOOGLE_DRIVE_API_KEY", purpose: "Importing client images from Drive.", shape: minLength(20) },
    ],
  },
  {
    group: "Operations",
    blurb: "Scheduled work, captcha, deployment identity.",
    rules: [
      { name: "CRON_SECRET", purpose: "Authenticates the scheduled jobs.", shape: minLength(16) },
      { name: "CAPTCHA_PROVIDER", purpose: "Which captcha guards public sign-up." },
      { name: "NEXT_PUBLIC_TURNSTILE_SITE_KEY", purpose: "Captcha widget on public forms." },
      { name: "TURNSTILE_SECRET_KEY", purpose: "Server-side captcha verification.", shape: minLength(20) },
      { name: "ENABLE_PUBLIC_SIGNUP", purpose: "Whether strangers can create accounts." },
    ],
  },
];

function fingerprint(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 8);
}

export function inspectEnv(): GroupReport[] {
  return GROUPS.map(({ group, blurb, rules }) => ({
    group,
    blurb,
    vars: rules.map((rule): VarReport => {
      const raw = process.env[rule.name];
      const value = raw?.trim() ?? "";
      const required = Boolean(rule.required);

      if (!value) {
        return {
          name: rule.name,
          status: required ? "missing" : "warn",
          purpose: rule.purpose,
          note: required ? "Required, and not set." : "Not set, so whatever it powers is switched off.",
          length: 0,
          fingerprint: null,
          required,
        };
      }

      const complaints: string[] = [];
      if (PLACEHOLDER.test(value)) {
        complaints.push(
          "contains placeholder text or whitespace — it looks like a template value that was pasted over"
        );
      }
      const shapeComplaint = rule.shape?.(value) ?? null;
      if (shapeComplaint) complaints.push(shapeComplaint);

      // A trailing newline or space is invisible in a dashboard and breaks
      // signatures and comparisons. Worth its own complaint.
      if (raw && raw !== value) complaints.push("has leading or trailing whitespace");

      return {
        name: rule.name,
        status: complaints.length ? "malformed" : "ok",
        purpose: rule.purpose,
        note: complaints.length ? `Value ${complaints.join("; ")}.` : undefined,
        length: value.length,
        fingerprint: fingerprint(value),
        required,
      };
    }),
  }));
}

// ---------------------------------------------------------------------------
// Live probes. Configuration looking right is not the same as it working.
// ---------------------------------------------------------------------------

export type ProbeResult = {
  name: string;
  ok: boolean;
  detail: string;
  ms: number;
  skipped?: boolean;
};

async function timed(
  name: string,
  run: () => Promise<{ ok: boolean; detail: string }>
): Promise<ProbeResult> {
  const start = Date.now();
  try {
    const out = await run();
    return { name, ...out, ms: Date.now() - start };
  } catch (err) {
    return {
      name,
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
      ms: Date.now() - start,
    };
  }
}

const skip = (name: string, detail: string): ProbeResult => ({
  name,
  ok: false,
  detail,
  ms: 0,
  skipped: true,
});

export async function runLiveProbes(): Promise<ProbeResult[]> {
  const probes: Promise<ProbeResult>[] = [];

  // Database — a real query through the service role.
  probes.push(
    timed("Supabase (database)", async () => {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!url || !key) return { ok: false, detail: "Not configured." };
      const { createClient } = await import("@supabase/supabase-js");
      const admin = createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { error, count } = await admin
        .from("clients")
        .select("id", { count: "exact", head: true });
      if (error) return { ok: false, detail: `${error.message} (${error.code ?? "no code"})` };
      return { ok: true, detail: `Connected. ${count ?? 0} client accounts.` };
    })
  );

  // Meta credentials — the exact check that took a day to work out by hand.
  probes.push(
    timed("Meta write credentials", async () => {
      const { diagnoseMetaCredentials } = await import("./meta-execute");
      const d = await diagnoseMetaCredentials();
      return { ok: d.ok, detail: d.detail };
    })
  );

  // Meta ad account — does the token actually reach the account we write to?
  probes.push(
    timed("Meta ad account", async () => {
      const token = process.env.META_ACCESS_TOKEN?.trim();
      let account = process.env.META_AD_ACCOUNT_ID?.trim();
      if (!token || !account) return { ok: false, detail: "Not configured." };
      if (!account.startsWith("act_")) account = `act_${account}`;
      const res = await fetch(
        `https://graph.facebook.com/v25.0/${account}?fields=name,account_status,currency&access_token=${encodeURIComponent(token)}`,
        { cache: "no-store", signal: AbortSignal.timeout(10_000) }
      );
      const data = await res.json();
      if (data.error) return { ok: false, detail: String(data.error.message ?? "refused") };
      return {
        ok: true,
        detail: `${data.name ?? account} · status ${data.account_status ?? "?"} · ${data.currency ?? "?"}`,
      };
    })
  );

  // Anthropic — a models list is free and proves the key.
  probes.push(
    timed("Anthropic API", async () => {
      const key = process.env.ANTHROPIC_API_KEY?.trim();
      if (!key) return { ok: false, detail: "Not configured." };
      const res = await fetch("https://api.anthropic.com/v1/models?limit=1", {
        headers: { "x-api-key": key, "anthropic-version": "2023-06-01" },
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        return { ok: false, detail: `${res.status} ${res.statusText} ${body.slice(0, 120)}` };
      }
      return { ok: true, detail: "Key accepted." };
    })
  );

  probes.push(
    timed("OpenAI API (image generation)", async () => {
      const key = process.env.OPENAI_API_KEY?.trim();
      if (!key) return { ok: false, detail: "Not configured — AI Creative images are off." };
      const res = await fetch("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${key}` },
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) return { ok: false, detail: `${res.status} ${res.statusText}` };
      return { ok: true, detail: "Key accepted." };
    })
  );

  probes.push(
    timed("Stripe", async () => {
      const key = process.env.STRIPE_SECRET_KEY?.trim();
      if (!key) return skipDetail("Not configured — billing is off.");
      const res = await fetch("https://api.stripe.com/v1/account", {
        headers: { Authorization: `Bearer ${key}` },
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      });
      const data = await res.json();
      if (!res.ok) return { ok: false, detail: String(data?.error?.message ?? res.status) };
      return { ok: true, detail: `${data.settings?.dashboard?.display_name ?? data.id} · ${data.default_currency ?? "?"}` };
    })
  );

  probes.push(
    timed("Pexels (stock images)", async () => {
      const key = process.env.PEXELS_API_KEY?.trim();
      if (!key) return skipDetail("Not configured — stock suggestions are off.");
      const res = await fetch("https://api.pexels.com/v1/search?query=test&per_page=1", {
        headers: { Authorization: key },
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) return { ok: false, detail: `${res.status} ${res.statusText}` };
      return { ok: true, detail: "Key accepted." };
    })
  );

  return Promise.all(probes);
}

/** Not-configured is a state, not a failure — kept distinct in the wording. */
function skipDetail(detail: string): { ok: boolean; detail: string } {
  return { ok: false, detail };
}
