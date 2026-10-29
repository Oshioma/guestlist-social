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
  /** Present only for values explicitly marked non-secret. */
  value?: string;
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
  /**
   * Not a secret — show the value in full. Ported from the super-admin
   * diagnostics this page replaces, and it is the better call for URLs, app
   * ids, flags and price ids: a typo you can read beats a fingerprint you
   * can only compare. Anything omitted here is treated as a secret.
   */
  publicValue?: boolean;
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
const PLACEHOLDER = /your[_ -]?app|your[_ -]?key|your[_ -]?secret|your[_ -]?id|changeme|xxxx|<[^>]+>|example\.com/i;

const GROUPS: { group: string; blurb: string; rules: Rule[] }[] = [
  {
    group: "Core",
    blurb: "Without these the app does not run.",
    rules: [
      { name: "NEXT_PUBLIC_SUPABASE_URL", purpose: "The database and storage endpoint.", required: true, shape: httpsUrl, publicValue: true },
      { name: "SUPABASE_SERVICE_ROLE_KEY", purpose: "Server-side database access that bypasses row-level security.", required: true, shape: minLength(40) },
      { name: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", purpose: "Browser-side database access, scoped by row-level security.", required: true, shape: minLength(20) },
      { name: "NEXT_PUBLIC_APP_URL", purpose: "Absolute links in emails and OAuth redirects.", shape: httpsUrl, publicValue: true },
      { name: "SUPER_ADMIN_EMAILS", purpose: "Who may reach the super-admin surfaces.", publicValue: true },
      { name: "NEXT_PUBLIC_SITE_URL", purpose: "Base URL for auth and email links.", required: true, shape: httpsUrl, publicValue: true },
    ],
  },
  {
    group: "Meta Ads",
    blurb: "Creating campaigns and ads, and switching delivery on.",
    rules: [
      { name: "META_ACCESS_TOKEN", purpose: "Every Graph call the ads side makes.", required: true, shape: minLength(50) },
      { name: "META_APP_SECRET", purpose: "Signs write calls (appsecret_proof). Must belong to the same app as the token.", shape: (v) => (/^[a-f0-9]{32}$/i.test(v) ? null : "should be 32 hex characters") },
      { name: "META_AD_ACCOUNT_ID", purpose: "The ad account campaigns are created in.", required: true, shape: prefixed("act_"), publicValue: true },
      { name: "META_APP_ID", purpose: "Not read by any code path — safe to delete.", shape: digits([15, 17]), publicValue: true },
      { name: "META_EXECUTE_DRY_RUN", purpose: '"false" lets the delivery switch spend real money. Anything else simulates.', shape: (v) => (["true", "false"].includes(v) ? null : 'should be "true" or "false"'), publicValue: true },
    ],
  },
  {
    group: "Meta & Instagram publishing",
    blurb: "Connecting accounts and publishing organic posts.",
    rules: [
      { name: "META_SOCIAL_APP_ID", purpose: "The publishing app, separate from the ads app.", shape: digits([15, 17]), publicValue: true },
      { name: "META_SOCIAL_APP_SECRET", purpose: "Publishing app OAuth exchange.", shape: minLength(20) },
      { name: "NEXT_PUBLIC_META_SOCIAL_APP_ID", purpose: "Browser-side Facebook login.", shape: digits([15, 17]), publicValue: true },
      { name: "META_SOCIAL_OAUTH_REDIRECT_URI", purpose: "Where Facebook returns after connecting.", shape: httpsUrl, publicValue: true },
      { name: "META_SOCIAL_LOGIN_CONFIG_ID", purpose: "Facebook Login for Business configuration.", shape: digits([10, 20]), publicValue: true },
      { name: "INSTAGRAM_APP_ID", purpose: "Instagram login app.", shape: digits([15, 17]), publicValue: true },
      { name: "INSTAGRAM_APP_SECRET", purpose: "Instagram OAuth exchange.", shape: minLength(20) },
      { name: "INSTAGRAM_OAUTH_REDIRECT_URI", purpose: "Where Instagram returns after connecting.", shape: httpsUrl, publicValue: true },
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
      { name: "STRIPE_PRICE_PRO", purpose: "Price id for the Pro plan.", publicValue: true },
      { name: "STRIPE_PRICE_AGENCY", purpose: "Price id for the Agency plan.", publicValue: true },
    ],
  },
  {
    group: "Email & media",
    blurb: "Outbound email, stock imagery, image imports.",
    rules: [
      { name: "RESEND_API_KEY", purpose: "Transactional email.", shape: prefixed("re_") },
      { name: "EMAIL_FROM", purpose: "Sender address on outbound email.", shape: (v) => (v.includes("@") ? null : "should be an email address"), publicValue: true },
      { name: "PEXELS_API_KEY", purpose: "Stock image suggestions.", shape: minLength(20) },
      { name: "GOOGLE_DRIVE_API_KEY", purpose: "Importing client images from Drive.", shape: minLength(20) },
    ],
  },
  {
    group: "Operations",
    blurb: "Scheduled work, captcha, deployment identity.",
    rules: [
      { name: "CRON_SECRET", purpose: "Authenticates the scheduled jobs.", shape: minLength(16) },
      { name: "CAPTCHA_PROVIDER", purpose: 'Which captcha guards public sign-up. Blank defaults to "turnstile".', publicValue: true },
      { name: "NEXT_PUBLIC_TURNSTILE_SITE_KEY", purpose: "Captcha widget on public forms. Only needed when public sign-up is open with the Turnstile provider.", publicValue: true },
      { name: "TURNSTILE_SECRET_KEY", purpose: "Server-side captcha verification.", shape: minLength(20) },
      { name: "ENABLE_PUBLIC_SIGNUP", purpose: "The initial default for self-registration. A database toggle overrides it — see the live checks.", publicValue: true },
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
      // A space inside a credential is always wrong; inside a comma-separated
      // list of emails it is not, so only flag whitespace for single values.
      if (!rule.name.endsWith("EMAILS") && /\s/.test(value)) {
        complaints.push("contains a space, which no key, id or URL should");
      }
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
        ...(rule.publicValue ? { value } : {}),
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

  // Schema drift. Ported from the super-admin diagnostics, extended with the
  // column whose absence silently broke ad creation, the clone-a-winner list
  // and Meta destinations all at once. 42P01 = no such table, 42703 = no such
  // column.
  probes.push(
    timed("Database schema", async () => {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!url || !key) return { ok: false, detail: "Not configured." };
      const { createClient } = await import("@supabase/supabase-js");
      const admin = createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
      });

      const targets: [string, string][] = [
        ["ads", "creative_destination_url"],
        ["email_templates", "key"],
        ["legal_pages", "key"],
        ["connected_meta_accounts", "auth_type"],
        ["campaigns", "meta_adset_id"],
        ["team_accounts", "team_id"],
      ];

      const results = await Promise.all(
        targets.map(async ([table, column]) => {
          const { error } = await admin
            .from(table)
            .select(column, { count: "exact", head: true })
            .limit(1);
          if (!error) return null;
          if (error.code === "42P01") return `${table} table missing`;
          if (error.code === "42703") return `${table}.${column} missing`;
          return `${table}: ${error.message}`;
        })
      );

      const problems = results.filter((r): r is string => Boolean(r));
      return problems.length
        ? { ok: false, detail: `Run the pending migrations — ${problems.join("; ")}.` }
        : { ok: true, detail: `${targets.length} tables and columns present.` };
    })
  );

  // Sign-up and captcha, as a pair. The env var is only the initial default —
  // a database toggle overrides it — and Turnstile keys only matter when
  // sign-up is actually open with the Turnstile provider. Reporting the keys
  // as "missing" without that context is how you get told off for a setting
  // that is working as intended.
  probes.push(
    timed("Sign-up & captcha", async () => {
      const { publicSignupEnabled } = await import("./auth/public-signup");
      const open = await publicSignupEnabled();
      const provider =
        (process.env.CAPTCHA_PROVIDER ?? "").trim().toLowerCase() || "turnstile";
      const keysSet =
        Boolean(process.env.TURNSTILE_SECRET_KEY?.trim()) &&
        Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim());

      if (!open) {
        return {
          ok: true,
          detail: `Closed — invite only. Captcha provider "${provider}"; Turnstile keys ${keysSet ? "set" : "not needed"}.`,
        };
      }
      if (provider === "turnstile" && !keysSet) {
        return {
          ok: false,
          detail:
            "Public sign-up is OPEN with the Turnstile provider, but the Turnstile keys are not set — sign-up will fail. Set both keys, change CAPTCHA_PROVIDER, or close sign-up.",
        };
      }
      return {
        ok: true,
        detail: `OPEN — anyone can register. Captcha provider "${provider}"${provider === "turnstile" ? " with keys set" : ""}. Honeypot, timing and rate limits apply regardless.`,
      };
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

export type CrossCheck = { name: string; ok: boolean; detail: string };

/**
 * Relationships between variables. Each one individually valid can still be
 * collectively wrong — a secret from the wrong app is exactly that, and it
 * cost a day.
 */
export function crossChecks(): CrossCheck[] {
  const out: CrossCheck[] = [];
  const get = (n: string) => process.env[n]?.trim() ?? "";

  const adsSecret = get("META_APP_SECRET");
  const socialSecret = get("META_SOCIAL_APP_SECRET");
  const adsAppId = get("META_APP_ID");
  const socialAppId = get("META_SOCIAL_APP_ID");

  if (adsSecret && socialSecret) {
    // Whether one secret for both jobs is right depends on whether one Meta
    // app does both jobs — which only Meta can confirm, so this states the
    // situation and leaves the verdict to "Your Meta apps" in the live checks.
    const same = adsSecret === socialSecret;
    out.push({
      name: "Ads and publishing app secrets",
      ok: true,
      detail: same
        ? `The same secret is used for running ads and for publishing. That is right when one Meta app does both jobs${
            socialAppId ? ` — publishing uses app ${socialAppId}` : ""
          }. Run the live checks: they name the app behind each job and say whether this secret belongs to it.`
        : "Different secrets, which is what two separate Meta apps need.",
    });
  }

  const publicSocial = get("NEXT_PUBLIC_META_SOCIAL_APP_ID");
  if (socialAppId && publicSocial) {
    out.push({
      name: "Publishing app id, server and browser",
      ok: socialAppId === publicSocial,
      detail:
        socialAppId === publicSocial
          ? "META_SOCIAL_APP_ID matches NEXT_PUBLIC_META_SOCIAL_APP_ID."
          : "META_SOCIAL_APP_ID and NEXT_PUBLIC_META_SOCIAL_APP_ID differ — the browser would start a login the server cannot finish.",
    });
  }

  const appUrl = get("NEXT_PUBLIC_APP_URL");
  const siteUrl = get("NEXT_PUBLIC_SITE_URL");
  if (appUrl && siteUrl) {
    out.push({
      name: "App and site URLs",
      ok: appUrl.replace(/\/$/, "") === siteUrl.replace(/\/$/, ""),
      detail:
        appUrl.replace(/\/$/, "") === siteUrl.replace(/\/$/, "")
          ? "NEXT_PUBLIC_APP_URL and NEXT_PUBLIC_SITE_URL agree."
          : `They differ (${appUrl} vs ${siteUrl}). Links built from one will not match redirects built from the other.`,
    });
  }

  for (const [uri, label] of [
    ["META_SOCIAL_OAUTH_REDIRECT_URI", "Facebook"],
    ["INSTAGRAM_OAUTH_REDIRECT_URI", "Instagram"],
  ] as const) {
    const value = get(uri);
    if (value && siteUrl) {
      const matches = value.startsWith(siteUrl.replace(/\/$/, ""));
      out.push({
        name: `${label} redirect URI host`,
        ok: matches,
        detail: matches
          ? `Points at this deployment (${value}).`
          : `${value} is not under NEXT_PUBLIC_SITE_URL — the OAuth round trip will land somewhere else.`,
      });
    }
  }

  return out;
}

/** Not-configured is a state, not a failure — kept distinct in the wording. */
function skipDetail(detail: string): { ok: boolean; detail: string } {
  return { ok: false, detail };
}

// ---------------------------------------------------------------------------
// Which Meta app is which.
//
// This app talks to three potentially different Meta apps — one for running
// ads, one for publishing to Facebook/Instagram pages, one for Instagram
// login — and the environment names them only by opaque 16-digit ids. Nothing
// in a dashboard tells you which id is which, and pairing an id with the wrong
// secret fails in ways that look like a dozen other problems.
//
// Meta will answer this directly. An app access token is literally
// "{app-id}|{app-secret}", so asking for /{app-id} with it does two jobs at
// once: it proves the id and secret belong together, and it returns the app's
// real name.
// ---------------------------------------------------------------------------

export type MetaAppIdentity = {
  /** What this app is used for, in this codebase. */
  role: string;
  /** The variables that carry it. */
  vars: string[];
  appId: string | null;
  /** The name Meta gives it, once verified. */
  appName: string | null;
  status: "ok" | "warn" | "error" | "missing";
  detail: string;
};

const GRAPH = "https://graph.facebook.com/v25.0";

/** Verifies an id/secret pair and returns the app's name from Meta. */
async function lookupAppByPair(
  appId: string,
  appSecret: string
): Promise<{ ok: boolean; name?: string; error?: string }> {
  try {
    const res = await fetch(
      `${GRAPH}/${appId}?fields=id,name&access_token=${encodeURIComponent(`${appId}|${appSecret}`)}`,
      { cache: "no-store", signal: AbortSignal.timeout(10_000) }
    );
    const data = await res.json();
    if (data?.error) return { ok: false, error: String(data.error.message ?? "rejected") };
    return { ok: true, name: data?.name ? String(data.name) : undefined };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Asks Meta which app issued a token, and what that app is called. */
async function lookupAppByToken(
  token: string
): Promise<{ ok: boolean; appId?: string; name?: string; error?: string }> {
  try {
    const res = await fetch(
      `${GRAPH}/debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(token)}`,
      { cache: "no-store", signal: AbortSignal.timeout(10_000) }
    );
    const data = await res.json();
    if (data?.error) return { ok: false, error: String(data.error.message ?? "rejected") };
    return {
      ok: true,
      appId: data?.data?.app_id ? String(data.data.app_id) : undefined,
      name: data?.data?.application ? String(data.data.application) : undefined,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function identifyMetaApps(): Promise<MetaAppIdentity[]> {
  const env = (name: string) => process.env[name]?.trim() || null;
  const out: MetaAppIdentity[] = [];
  // Filled in from the token, then compared with the publishing app so the
  // page can state the relationship instead of describing both possibilities.
  let adsAppId: string | null = null;

  // 1. Ads. The app is whichever one issued the token — there is no separate
  //    "ads app id" variable that any code path reads.
  const adsToken = env("META_ACCESS_TOKEN");
  if (!adsToken) {
    out.push({
      role: "Running ads",
      vars: ["META_ACCESS_TOKEN", "META_AD_ACCOUNT_ID", "META_APP_SECRET"],
      appId: null,
      appName: null,
      status: "missing",
      detail: "META_ACCESS_TOKEN is not set, so the ads side cannot talk to Meta at all.",
    });
  } else {
    const found = await lookupAppByToken(adsToken);
    const secret = env("META_APP_SECRET");
    let detail = found.ok
      ? `META_ACCESS_TOKEN was issued by this app. Campaigns and ads are created in ad account ${env("META_AD_ACCOUNT_ID") ?? "(not set)"}.`
      : `Meta would not identify the token: ${found.error}`;

    let status: MetaAppIdentity["status"] = found.ok ? "ok" : "error";

    // Does META_APP_SECRET belong to this app? That pairing is what signs
    // write calls, and getting it wrong is invisible until a write fails.
    if (found.ok && found.appId && secret) {
      const pair = await lookupAppByPair(found.appId, secret);
      if (pair.ok) {
        detail += " META_APP_SECRET belongs to this app, so writes are signed.";
      } else {
        status = "warn";
        detail +=
          ` META_APP_SECRET does NOT belong to this app (${pair.error}), so writes go unsigned.` +
          " Copy the App Secret from this app's Settings → Basic to fix the pairing.";
      }
    }

    adsAppId = found.appId ?? null;
    out.push({
      role: "Running ads",
      vars: ["META_ACCESS_TOKEN", "META_AD_ACCOUNT_ID", "META_APP_SECRET"],
      appId: found.appId ?? null,
      appName: found.name ?? null,
      status,
      detail,
    });
  }

  // 2. Publishing to Facebook / Instagram pages.
  const socialId = env("META_SOCIAL_APP_ID");
  const socialSecret = env("META_SOCIAL_APP_SECRET");
  if (!socialId || !socialSecret) {
    out.push({
      role: "Publishing posts (Facebook & Instagram pages)",
      vars: ["META_SOCIAL_APP_ID", "META_SOCIAL_APP_SECRET", "NEXT_PUBLIC_META_SOCIAL_APP_ID"],
      appId: socialId,
      appName: null,
      status: "missing",
      detail: "Both the id and the secret are needed to complete a Facebook connection.",
    });
  } else {
    const pair = await lookupAppByPair(socialId, socialSecret);
    const sharesAdsApp = adsAppId !== null && adsAppId === socialId;
    const sameSecret =
      env("META_APP_SECRET") !== null && env("META_APP_SECRET") === socialSecret;

    let detail = pair.ok
      ? "The id and secret belong together, so connecting a Facebook page can complete."
      : `Meta rejected this id/secret pair (${pair.error}). One of them is from a different app, and connecting a page will fail at the token exchange.`;

    // The thing that was previously left hanging: is this the ads app or not?
    if (sharesAdsApp) {
      detail +=
        ` This is the same app that runs your ads (${adsAppId}) — one app does both jobs, so using one secret for META_APP_SECRET and META_SOCIAL_APP_SECRET is correct.`;
    } else if (adsAppId) {
      detail +=
        ` This is a different app from the one that runs your ads (${adsAppId}), so META_APP_SECRET and META_SOCIAL_APP_SECRET must hold different values` +
        (sameSecret
          ? " — and right now they hold the same one, so at least one of them is wrong."
          : ".");
    }

    out.push({
      role: "Publishing posts (Facebook & Instagram pages)",
      vars: ["META_SOCIAL_APP_ID", "META_SOCIAL_APP_SECRET", "NEXT_PUBLIC_META_SOCIAL_APP_ID"],
      appId: socialId,
      appName: pair.name ?? null,
      status: pair.ok && (!sameSecret || sharesAdsApp) ? "ok" : pair.ok ? "warn" : "error",
      detail,
    });
  }

  // 3. Instagram login (a separate app in Meta's model).
  const igId = env("INSTAGRAM_APP_ID");
  const igSecret = env("INSTAGRAM_APP_SECRET");
  if (!igId || !igSecret) {
    out.push({
      role: "Instagram login",
      vars: ["INSTAGRAM_APP_ID", "INSTAGRAM_APP_SECRET"],
      appId: igId,
      appName: null,
      status: "missing",
      detail: "Instagram's own login flow needs both values.",
    });
  } else {
    const pair = await lookupAppByPair(igId, igSecret);
    out.push({
      role: "Instagram login",
      vars: ["INSTAGRAM_APP_ID", "INSTAGRAM_APP_SECRET"],
      appId: igId,
      appName: pair.name ?? null,
      status: pair.ok ? "ok" : "error",
      detail: pair.ok
        ? "The id and secret belong together."
        : `Meta rejected this id/secret pair (${pair.error}).`,
    });
  }

  // 4. Anything left over. META_APP_ID is read by nothing.
  const strayAppId = env("META_APP_ID");
  if (strayAppId) {
    out.push({
      role: "Unused",
      vars: ["META_APP_ID"],
      appId: strayAppId,
      appName: null,
      status: "warn",
      detail:
        "No code path reads META_APP_ID. It is only a source of confusion when working out which app is which — delete it in Vercel.",
    });
  }

  return out;
}
