/**
 * Meta execution layer.
 *
 * This file owns every WRITE call to Meta. Reads still go through `lib/meta.ts`.
 * The split exists because writes:
 *
 *   1. Must be appsecret_proof signed (HMAC-SHA256 of the access token with
 *      META_APP_SECRET) — Meta will reject server-side writes that aren't
 *      proven, even if the access token alone is valid.
 *   2. Must run their own state re-fetch + guard chain right before the POST,
 *      not just trust whatever the queue row was created with — between
 *      queue creation and execution, the operator may have already paused
 *      the ad in Ads Manager, or budget may have drifted.
 *   3. Must respect a hard DRY_RUN env gate — when META_EXECUTE_DRY_RUN is
 *      not "false", every executor returns the simulated payload instead of
 *      making the network call. This is the safety net for the first
 *      production deploys: nothing actually changes on Meta until an
 *      operator explicitly flips the env var.
 *
 * The three executors here are intentionally the SAFEST possible writes:
 *   - executePauseAd               — reversible, always safer than the current state
 *   - executeIncreaseAdsetBudget   — capped at +20%, always upward only
 *   - executeDecreaseAdsetBudget   — capped at −50%, always downward only
 *   - executeDuplicateAd           — copies to PAUSED, never auto-launches
 *
 * Higher-risk actions (creative edits, audience swaps, automatic launches)
 * are deliberately not in this file.
 */

import { createHash, createHmac } from "crypto";

const API_VERSION = "v25.0";
const BASE_URL = `https://graph.facebook.com/${API_VERSION}`;

// ---------------------------------------------------------------------------
// Hard caps. These are NUMBERS in code, not config rows, on purpose — they
// are the last line of defence and shouldn't be editable by anyone who can
// only touch the database.
// ---------------------------------------------------------------------------

/** Max one-shot budget bump. ±20%, no exceptions. */
export const MAX_BUDGET_INCREASE_PCT = 20;

/**
 * Max one-shot budget pullback. −50%, no exceptions. We're more permissive
 * with downward moves than upward ones because pulling back spend is the
 * conservative side of the trade — the worst case is a winner gets
 * starved, which the operator notices in a day. Asymmetric on purpose.
 */
export const MAX_BUDGET_DECREASE_PCT = 50;

/** Queue items older than this are stale — re-queue, don't execute. */
export const QUEUE_ITEM_TTL_MS = 24 * 60 * 60 * 1000; // 24h
export const APPROVAL_STALENESS_MS = 60 * 60 * 1000; // 1h

/** Per-source-ad duplicate cooldown. */
export const DUPLICATE_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24h

// ---------------------------------------------------------------------------
// Credentials + signing
// ---------------------------------------------------------------------------

function getCredentials() {
  // Trimmed on purpose: a secret pasted into a hosting dashboard often arrives
  // with a trailing newline or space, which changes the HMAC and produces
  // "Invalid appsecret_proof" with nothing to point at.
  const token = process.env.META_ACCESS_TOKEN?.trim();
  const appSecret = process.env.META_APP_SECRET?.trim();

  if (!token) {
    throw new Error("Missing META_ACCESS_TOKEN.");
  }

  // A missing secret is no longer fatal. appsecret_proof only protects a
  // leaked token when the APP is configured to require it — and in that case
  // Meta rejects unsigned calls itself. Refusing to write locally just blocks
  // the operator while every other write path in this app (campaign create,
  // ad create, publish) posts unsigned and works. Sign when we can; say so
  // when we can't.
  return { token, appSecret: appSecret ?? null };
}

/**
 * `appsecret_proof` = HMAC-SHA256(accessToken, appSecret), hex.
 * Meta requires this on every server-side write call.
 */
function appsecretProof(token: string, appSecret: string): string {
  return createHmac("sha256", appSecret).update(token).digest("hex");
}

/** True when DRY RUN mode is engaged — default ON until explicitly disabled. */
export function isDryRun(): boolean {
  // Default is dry-run. Operator must set META_EXECUTE_DRY_RUN=false
  // to enable live writes. This is intentional belt-and-braces.
  return process.env.META_EXECUTE_DRY_RUN !== "false";
}

// ---------------------------------------------------------------------------
// Low-level fetch helpers
// ---------------------------------------------------------------------------

/** Read-side GET. Used by the state-refresh step in every executor. */
async function metaGet<T>(
  path: string,
  fields: string[]
): Promise<T> {
  const { token, appSecret } = getCredentials();
  const url = new URL(`${BASE_URL}${path}`);
  url.searchParams.set("access_token", token);
  if (appSecret && proofUsable !== false) {
    url.searchParams.set("appsecret_proof", appsecretProof(token, appSecret));
  }
  url.searchParams.set("fields", fields.join(","));

  const res = await fetch(url.toString(), {
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  const data = await res.json();
  if (data.error) {
    throw new Error(`Meta GET ${path}: ${data.error.message ?? "unknown"}`);
  }
  return data as T;
}

/** Write-side POST. Always signed. */
import { logMetaWrite } from "./meta-write-log";

/** Write-side POST. Logs every call to meta_write_log. */
/**
 * Remembers, for the life of this instance, whether the configured secret
 * produces a proof Meta accepts. Starts unknown; set to false the first time
 * Meta rejects the proof, so the rest of the calls in this invocation skip
 * straight to the unsigned form instead of failing one by one.
 */
let proofUsable: boolean | null = null;

/** True when the app secret is configured but Meta has rejected its proof. */
export function isProofRejected(): boolean {
  return proofUsable === false;
}

async function metaPost<T>(
  path: string,
  body: Record<string, string>,
  logContext?: { operation?: string; clientId?: number; adId?: number; queueId?: number }
): Promise<T> {
  const { token, appSecret } = getCredentials();
  const signed = Boolean(appSecret) && proofUsable !== false;
  const params = new URLSearchParams({
    ...body,
    access_token: token,
    ...(signed && appSecret
      ? { appsecret_proof: appsecretProof(token, appSecret) }
      : {}),
  });

  const start = Date.now();
  const res = await fetch(`${BASE_URL}${path}`, {
    signal: AbortSignal.timeout(15_000),
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });
  const data = await res.json();
  const durationMs = Date.now() - start;

  const success = !data.error;
  logMetaWrite({
    operation: logContext?.operation ?? `execute:${path}`,
    clientId: logContext?.clientId,
    adId: logContext?.adId,
    queueId: logContext?.queueId,
    metaEndpoint: path,
    requestBody: body,
    responseStatus: res.status,
    responseBody: data,
    success,
    errorMessage: data.error?.message ?? null,
    durationMs,
  });

  if (data.error) {
    const message = String(data.error.message ?? "unknown");

    // A rejected proof means the secret belongs to a different app than the
    // token. The call itself is fine unsigned — that is how the rest of this
    // app writes to Meta — so drop the proof and try once more rather than
    // stopping the operator over a configuration mismatch they may not be
    // able to fix. The mismatch is still reported in the UI.
    if (signed && message.toLowerCase().includes("appsecret_proof")) {
      console.error(
        `metaPost ${path}: Meta rejected appsecret_proof (META_APP_SECRET is from a different app than META_ACCESS_TOKEN) — retrying unsigned.`
      );
      proofUsable = false;
      return metaPost<T>(path, body, logContext);
    }

    throw new Error(`Meta POST ${path}: ${message}`);
  }

  if (signed) proofUsable = true;
  return data as T;
}

// ---------------------------------------------------------------------------
// Shape-only types for the state shapes we re-read before writing.
// ---------------------------------------------------------------------------

export type AdState = {
  id: string;
  status: "ACTIVE" | "PAUSED" | "DELETED" | "ARCHIVED";
  effective_status: string;
  configured_status?: string;
  adset_id?: string;
  campaign_id?: string;
  name?: string;
};

export type AdsetState = {
  id: string;
  name?: string;
  status: "ACTIVE" | "PAUSED" | "DELETED" | "ARCHIVED";
  effective_status?: string;
  daily_budget?: string; // cents, returned as string by Graph
  lifetime_budget?: string;
};

// ---------------------------------------------------------------------------
// State-refresh helpers
// ---------------------------------------------------------------------------

export async function fetchAdState(adMetaId: string): Promise<AdState> {
  return metaGet<AdState>(`/${adMetaId}`, [
    "id",
    "name",
    "status",
    "effective_status",
    "configured_status",
    "adset_id",
    "campaign_id",
  ]);
}

export async function fetchAdsetState(adsetMetaId: string): Promise<AdsetState> {
  return metaGet<AdsetState>(`/${adsetMetaId}`, [
    "id",
    "name",
    "status",
    "effective_status",
    "daily_budget",
    "lifetime_budget",
  ]);
}

// ---------------------------------------------------------------------------
// Guard helpers. Each one throws on violation — the route catches and writes
// the message into execution_error.
// ---------------------------------------------------------------------------

/** A queue row that's been sitting around longer than the TTL is stale. */
export function assertQueueItemFresh(createdAt: string | Date): void {
  const created = new Date(createdAt).getTime();
  if (Number.isNaN(created)) {
    throw new Error("Queue item has invalid created_at.");
  }
  if (Date.now() - created > QUEUE_ITEM_TTL_MS) {
    throw new Error(
      "Queue item is older than 24h — re-queue with fresh state instead of executing."
    );
  }
}

export function assertApprovalFresh(approvedAt: string | null | undefined): void {
  if (!approvedAt) return;
  const approved = new Date(approvedAt).getTime();
  if (Number.isNaN(approved)) return;
  const ageMs = Date.now() - approved;
  if (ageMs > APPROVAL_STALENESS_MS) {
    const ageMin = Math.round(ageMs / 60000);
    throw new Error(
      `Approval is ${ageMin} minutes old (limit: ${Math.round(APPROVAL_STALENESS_MS / 60000)} min). ` +
      `Preview the current Meta state first, then re-approve to execute.`
    );
  }
}

/** Pause is only meaningful when the ad is currently delivering. */
export function assertPausableAd(state: AdState): void {
  const ineligible = ["PAUSED", "DELETED", "ARCHIVED"];
  if (ineligible.includes(state.status)) {
    throw new Error(
      `Ad ${state.id} is already ${state.status} — nothing to pause.`
    );
  }
  if (state.effective_status && ineligible.includes(state.effective_status)) {
    throw new Error(
      `Ad ${state.id} effective_status is ${state.effective_status} — pause skipped.`
    );
  }
}

/**
 * Budget guard: only allow upward changes within ±MAX_BUDGET_INCREASE_PCT
 * of the CURRENT live budget — not the budget the queue row was created
 * against. The current live budget is what Meta returned in the refresh.
 */
export function assertBudgetDelta(
  currentBudgetCents: number,
  proposedBudgetCents: number
): void {
  if (currentBudgetCents <= 0) {
    throw new Error(
      "Adset has no daily_budget set (likely campaign-level CBO) — refusing to change."
    );
  }
  if (proposedBudgetCents <= currentBudgetCents) {
    throw new Error(
      `Proposed budget ${proposedBudgetCents} is not an increase over current ${currentBudgetCents}.`
    );
  }
  const pctChange =
    ((proposedBudgetCents - currentBudgetCents) / currentBudgetCents) * 100;
  if (pctChange > MAX_BUDGET_INCREASE_PCT) {
    throw new Error(
      `Proposed +${pctChange.toFixed(1)}% exceeds hard cap of +${MAX_BUDGET_INCREASE_PCT}%.`
    );
  }
}

/**
 * Mirror of assertBudgetDelta for downward moves. Allows pullbacks within
 * MAX_BUDGET_DECREASE_PCT of the current live budget. Refuses to land on a
 * budget below Meta's minimum — Meta enforces a $1/day floor for most
 * objectives, and trying to set sub-$1 returns a confusing API error rather
 * than the obvious "too low" we want operators to see.
 */
export const MIN_DAILY_BUDGET_CENTS = 100;
export function assertBudgetDecreaseDelta(
  currentBudgetCents: number,
  proposedBudgetCents: number
): void {
  if (currentBudgetCents <= 0) {
    throw new Error(
      "Adset has no daily_budget set (likely campaign-level CBO) — refusing to change."
    );
  }
  if (proposedBudgetCents >= currentBudgetCents) {
    throw new Error(
      `Proposed budget ${proposedBudgetCents} is not a decrease from current ${currentBudgetCents}.`
    );
  }
  if (proposedBudgetCents < MIN_DAILY_BUDGET_CENTS) {
    throw new Error(
      `Proposed budget ${proposedBudgetCents} cents is below Meta's $${(MIN_DAILY_BUDGET_CENTS / 100).toFixed(2)}/day floor.`
    );
  }
  const pctChange =
    ((currentBudgetCents - proposedBudgetCents) / currentBudgetCents) * 100;
  if (pctChange > MAX_BUDGET_DECREASE_PCT) {
    throw new Error(
      `Proposed −${pctChange.toFixed(1)}% exceeds hard cap of −${MAX_BUDGET_DECREASE_PCT}%.`
    );
  }
}

/**
 * Adset must be live for a budget bump to mean anything; we never want to
 * "wake up" a paused adset accidentally by editing its budget.
 */
export function assertAdsetLive(state: AdsetState): void {
  if (state.status !== "ACTIVE") {
    throw new Error(
      `Adset ${state.id} status is ${state.status} — refusing to change budget on a non-active adset.`
    );
  }
}

/** Source ad must still exist and be readable to be duplicated from. */
export function assertDuplicableSource(state: AdState): void {
  if (state.status === "DELETED" || state.status === "ARCHIVED") {
    throw new Error(
      `Source ad ${state.id} is ${state.status} — cannot duplicate.`
    );
  }
}

// ---------------------------------------------------------------------------
// Action 1 — Pause an ad.
// ---------------------------------------------------------------------------

export type PauseAdResult = {
  ok: true;
  dryRun: boolean;
  before: AdState;
  request: { path: string; body: Record<string, string> };
  response: unknown;
};

export async function executePauseAd(adMetaId: string): Promise<PauseAdResult> {
  // 1. Re-fetch live state.
  const before = await fetchAdState(adMetaId);

  // 2. Guard.
  assertPausableAd(before);

  // 3. Build the request.
  const path = `/${adMetaId}`;
  const body = { status: "PAUSED" };

  // 4. Dry-run short-circuit.
  if (isDryRun()) {
    return {
      ok: true,
      dryRun: true,
      before,
      request: { path, body },
      response: { simulated: true, would_set: "PAUSED" },
    };
  }

  // 5. Live POST.
  const response = await metaPost<{ success?: boolean }>(path, body);

  return { ok: true, dryRun: false, before, request: { path, body }, response };
}

// ---------------------------------------------------------------------------
// Action 2 — Increase an ad set's daily budget.
//
// We accept BOTH the percent change the operator approved AND the budget
// the queue was created against, then re-derive the proposed cents from
// CURRENT live budget. This way, if budget drifted between approval and
// execution, we still respect the percent (not the stale absolute number).
// ---------------------------------------------------------------------------

export type IncreaseAdsetBudgetInput = {
  adsetMetaId: string;
  /** Percent change agreed at approval time, e.g. 15 for +15%. */
  percentChange: number;
  /**
   * Optional: if provided, we sanity-check that the live budget hasn't
   * drifted off the queue row by more than 5%. If it has, we abort —
   * the situation has changed enough that the human should re-approve.
   */
  expectedCurrentBudgetCents?: number;
};

export type IncreaseAdsetBudgetResult = {
  ok: true;
  dryRun: boolean;
  before: AdsetState;
  oldBudgetCents: number;
  newBudgetCents: number;
  appliedPercent: number;
  request: { path: string; body: Record<string, string> };
  response: unknown;
};

export async function executeIncreaseAdsetBudget(
  input: IncreaseAdsetBudgetInput
): Promise<IncreaseAdsetBudgetResult> {
  const { adsetMetaId, percentChange, expectedCurrentBudgetCents } = input;

  // Cap the requested percent up-front. Even if the queue row says +50%,
  // we never let more than MAX_BUDGET_INCREASE_PCT through.
  if (percentChange <= 0) {
    throw new Error(`percentChange must be positive (got ${percentChange}).`);
  }
  if (percentChange > MAX_BUDGET_INCREASE_PCT) {
    throw new Error(
      `Requested +${percentChange}% exceeds hard cap of +${MAX_BUDGET_INCREASE_PCT}%.`
    );
  }

  // 1. Re-fetch live adset state.
  const before = await fetchAdsetState(adsetMetaId);

  // 2. Guard the adset is live.
  assertAdsetLive(before);

  const currentBudgetCents = Number(before.daily_budget ?? 0);

  // Drift check — if the live budget no longer matches what the queue row
  // expected, the world has changed and a human needs to re-approve.
  if (
    typeof expectedCurrentBudgetCents === "number" &&
    expectedCurrentBudgetCents > 0
  ) {
    const driftPct =
      Math.abs(currentBudgetCents - expectedCurrentBudgetCents) /
      expectedCurrentBudgetCents *
      100;
    if (driftPct > 5) {
      throw new Error(
        `Live budget ${currentBudgetCents} drifted ${driftPct.toFixed(
          1
        )}% from expected ${expectedCurrentBudgetCents} — re-approve.`
      );
    }
  }

  // 3. Compute new budget from current live budget.
  const newBudgetCents = Math.round(
    currentBudgetCents * (1 + percentChange / 100)
  );

  // 4. Re-validate against the hard cap (delta-based, not just percent-based).
  assertBudgetDelta(currentBudgetCents, newBudgetCents);

  // 5. Build the request.
  const path = `/${adsetMetaId}`;
  const body = { daily_budget: String(newBudgetCents) };

  // 6. Dry-run short-circuit.
  if (isDryRun()) {
    return {
      ok: true,
      dryRun: true,
      before,
      oldBudgetCents: currentBudgetCents,
      newBudgetCents,
      appliedPercent: percentChange,
      request: { path, body },
      response: {
        simulated: true,
        would_set_daily_budget_cents: newBudgetCents,
      },
    };
  }

  // 7. Live POST.
  const response = await metaPost<{ success?: boolean }>(path, body);

  return {
    ok: true,
    dryRun: false,
    before,
    oldBudgetCents: currentBudgetCents,
    newBudgetCents,
    appliedPercent: percentChange,
    request: { path, body },
    response,
  };
}

// ---------------------------------------------------------------------------
// Action 2b — Decrease an ad set's daily budget.
//
// Mirror of executeIncreaseAdsetBudget with a downward delta cap. Same
// re-fetch + drift check semantics so the operator's approved percent
// is applied to the CURRENT budget, not whatever the queue row was
// created against.
// ---------------------------------------------------------------------------

export type DecreaseAdsetBudgetInput = {
  adsetMetaId: string;
  /** Percent change agreed at approval time, e.g. 20 for −20%. Always positive. */
  percentChange: number;
  /**
   * Optional drift check — if the live budget no longer matches what the
   * queue row expected (within 5%), we abort so a human can re-approve.
   */
  expectedCurrentBudgetCents?: number;
};

export type DecreaseAdsetBudgetResult = {
  ok: true;
  dryRun: boolean;
  before: AdsetState;
  oldBudgetCents: number;
  newBudgetCents: number;
  appliedPercent: number;
  request: { path: string; body: Record<string, string> };
  response: unknown;
};

export async function executeDecreaseAdsetBudget(
  input: DecreaseAdsetBudgetInput
): Promise<DecreaseAdsetBudgetResult> {
  const { adsetMetaId, percentChange, expectedCurrentBudgetCents } = input;

  if (percentChange <= 0) {
    throw new Error(`percentChange must be positive (got ${percentChange}).`);
  }
  if (percentChange > MAX_BUDGET_DECREASE_PCT) {
    throw new Error(
      `Requested −${percentChange}% exceeds hard cap of −${MAX_BUDGET_DECREASE_PCT}%.`
    );
  }

  const before = await fetchAdsetState(adsetMetaId);
  assertAdsetLive(before);

  const currentBudgetCents = Number(before.daily_budget ?? 0);

  if (
    typeof expectedCurrentBudgetCents === "number" &&
    expectedCurrentBudgetCents > 0
  ) {
    const driftPct =
      Math.abs(currentBudgetCents - expectedCurrentBudgetCents) /
      expectedCurrentBudgetCents *
      100;
    if (driftPct > 5) {
      throw new Error(
        `Live budget ${currentBudgetCents} drifted ${driftPct.toFixed(
          1
        )}% from expected ${expectedCurrentBudgetCents} — re-approve.`
      );
    }
  }

  const newBudgetCents = Math.round(
    currentBudgetCents * (1 - percentChange / 100)
  );

  assertBudgetDecreaseDelta(currentBudgetCents, newBudgetCents);

  const path = `/${adsetMetaId}`;
  const body = { daily_budget: String(newBudgetCents) };

  if (isDryRun()) {
    return {
      ok: true,
      dryRun: true,
      before,
      oldBudgetCents: currentBudgetCents,
      newBudgetCents,
      appliedPercent: percentChange,
      request: { path, body },
      response: {
        simulated: true,
        would_set_daily_budget_cents: newBudgetCents,
      },
    };
  }

  const response = await metaPost<{ success?: boolean }>(path, body);

  return {
    ok: true,
    dryRun: false,
    before,
    oldBudgetCents: currentBudgetCents,
    newBudgetCents,
    appliedPercent: percentChange,
    request: { path, body },
    response,
  };
}

// ---------------------------------------------------------------------------
// Action 3 — Duplicate an ad.
//
// Uses Meta's `/{ad_id}/copies` endpoint. Always copies to PAUSED so the
// duplicate never auto-launches — the operator picks it up from Ads Manager
// or our queue and decides when (or whether) to enable it.
//
// Caller is responsible for ensuring no recent duplicate exists for the
// same source ad — we surface a `recentDuplicateExists` helper for that
// check, but the API route layer is the right place to actually call it
// (it has the supabase client).
// ---------------------------------------------------------------------------

export type DuplicateAdInput = {
  adMetaId: string;
  /** Suffix to append to the new ad name, e.g. " (test variant)". */
  newNameSuffix?: string;
  /**
   * Optional creative override map. We do NOT support arbitrary creative
   * edits here — only a small allowlist (rename), because creative edits
   * deserve their own approval flow.
   */
  rename?: string;
};

export type DuplicateAdResult = {
  ok: true;
  dryRun: boolean;
  source: AdState;
  request: { path: string; body: Record<string, string> };
  response: unknown;
  newAdId: string | null;
};

export async function executeDuplicateAd(
  input: DuplicateAdInput
): Promise<DuplicateAdResult> {
  const { adMetaId, newNameSuffix, rename } = input;

  // 1. Re-fetch source state.
  const source = await fetchAdState(adMetaId);

  // 2. Guard the source is duplicable.
  assertDuplicableSource(source);

  // 3. Build the request. Critical: status_option=PAUSED so the duplicate
  // never auto-launches.
  const path = `/${adMetaId}/copies`;
  const body: Record<string, string> = {
    deep_copy: "false",
    status_option: "PAUSED",
  };

  if (rename) {
    body.rename_options = JSON.stringify({ rename_strategy: "ONLY_TOP_LEVEL_RENAME", rename_prefix: rename });
  } else if (newNameSuffix) {
    body.rename_options = JSON.stringify({
      rename_strategy: "DEEP_RENAME",
      rename_suffix: newNameSuffix,
    });
  }

  // 4. Dry-run short-circuit.
  if (isDryRun()) {
    return {
      ok: true,
      dryRun: true,
      source,
      request: { path, body },
      response: {
        simulated: true,
        would_copy_ad: adMetaId,
        status_option: "PAUSED",
      },
      newAdId: null,
    };
  }

  // 5. Live POST.
  const response = await metaPost<{ copied_ad_id?: string; ad_id?: string }>(
    path,
    body
  );

  // Meta returns either copied_ad_id or ad_id depending on the API version.
  const newAdId = response.copied_ad_id ?? response.ad_id ?? null;

  return {
    ok: true,
    dryRun: false,
    source,
    request: { path, body },
    response,
    newAdId,
  };
}

// ---------------------------------------------------------------------------
// Delivery switch — the only thing in this codebase that can start spend.
//
// Everything else here is deliberately one-way-safe: pause, decrease, or copy
// to PAUSED. Turning delivery ON is the opposite, so it is written to be
// explicit about what it touches and to obey the same dry-run default as the
// rest of the execution layer. A campaign only delivers when all three levels
// are ACTIVE, so a half-flip would be worse than useless: it would look live
// and spend nothing, or look paused and spend.
// ---------------------------------------------------------------------------

export type DeliveryTarget = {
  campaignMetaId: string | null;
  adsetMetaId: string | null;
  adMetaIds: string[];
};

export type SetDeliveryResult = {
  ok: boolean;
  dryRun: boolean;
  /** Meta ids actually flipped, in the order they were flipped. */
  changed: string[];
  error?: string;
};

export async function setDelivery(
  target: DeliveryTarget,
  live: boolean,
  logContext?: { clientId?: number }
): Promise<SetDeliveryResult> {
  const status = live ? "ACTIVE" : "PAUSED";
  const ids = [
    target.campaignMetaId,
    target.adsetMetaId,
    ...target.adMetaIds,
  ].filter((id): id is string => Boolean(id));

  if (ids.length === 0) {
    return {
      ok: false,
      dryRun: isDryRun(),
      changed: [],
      error: "Nothing to switch — this campaign has not been created in Meta.",
    };
  }

  if (isDryRun()) {
    return { ok: true, dryRun: true, changed: [] };
  }

  const changed: string[] = [];
  try {
    // Order matters going live: campaign, then ad set, then ads, so delivery
    // never opens at a level whose parent is still paused. Pausing walks the
    // same order — the campaign stops everything beneath it immediately.
    for (const id of ids) {
      await metaPost<{ success?: boolean }>(
        `/${id}`,
        { status },
        { operation: `delivery:${live ? "activate" : "pause"}`, clientId: logContext?.clientId }
      );
      changed.push(id);
    }
    return { ok: true, dryRun: false, changed };
  } catch (err) {
    return {
      ok: false,
      dryRun: false,
      changed,
      error: err instanceof Error ? err.message : "Meta refused the change.",
    };
  }
}


// ---------------------------------------------------------------------------
// Credential diagnosis.
//
// "Invalid appsecret_proof provided in the API argument" means the HMAC did
// not match — in practice, META_APP_SECRET belongs to a different app than the
// one that issued META_ACCESS_TOKEN. The proof itself is computed to spec, so
// no amount of retrying helps; what is needed is which app the token is from,
// which Meta will say if asked.
// ---------------------------------------------------------------------------

export type CredentialDiagnosis = {
  ok: boolean;
  /** Operator-facing, safe to display: ids and lengths only, never secrets. */
  detail: string;
  /** The app that issued META_ACCESS_TOKEN, per Meta. */
  tokenAppId?: string | null;
  /**
   * First 8 hex characters of SHA-256 over the loaded secret. Not reversible,
   * and the only way to answer "did my edit to the env var actually reach this
   * deployment?" — the same value means nothing changed.
   */
  appSecretFingerprint?: string | null;
};

/** Short, non-reversible fingerprint so a changed value is visibly changed. */
function fingerprint(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 8);
}

export async function diagnoseMetaCredentials(): Promise<CredentialDiagnosis> {
  const token = process.env.META_ACCESS_TOKEN?.trim();
  const appSecret = process.env.META_APP_SECRET?.trim();

  if (!token) return { ok: false, detail: "META_ACCESS_TOKEN is not set." };
  if (!appSecret) {
    return {
      ok: false,
      detail:
        "META_APP_SECRET is not set. Writes will go to Meta unsigned, which works unless the app requires a signature.",
      appSecretFingerprint: null,
    };
  }

  let appId: string | null = null;
  try {
    const res = await fetch(
      `${BASE_URL}/debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(token)}`,
      { cache: "no-store", signal: AbortSignal.timeout(10_000) }
    );
    const data = await res.json();
    appId = data?.data?.app_id ? String(data.data.app_id) : null;
  } catch {
    /* the /me probe below is the one that matters */
  }

  try {
    const proof = appsecretProof(token, appSecret);
    const res = await fetch(
      `${BASE_URL}/me?access_token=${encodeURIComponent(token)}&appsecret_proof=${proof}`,
      { cache: "no-store", signal: AbortSignal.timeout(10_000) }
    );
    const data = await res.json();
    if (data?.error) {
      const message = String(data.error.message ?? "");
      if (message.toLowerCase().includes("appsecret_proof")) {
        return {
          ok: false,
          tokenAppId: appId,
          appSecretFingerprint: fingerprint(appSecret),
          detail:
            `META_APP_SECRET does not match the app that issued META_ACCESS_TOKEN. ` +
            `Writes still go through — the app now retries them unsigned — but fixing the pairing restores the signature. ` +
            (appId
              ? `The token belongs to app ${appId}, so take the secret from that app: developers.facebook.com → app ${appId} → Settings → Basic → App Secret. `
              : "Take the secret from the same app the token was generated in. ") +
            `Then update META_APP_SECRET in your hosting environment and redeploy. ` +
            `(Secret currently loaded: ${appSecret.length} characters.)`,
        };
      }
      return {
        ok: false,
        tokenAppId: appId,
        appSecretFingerprint: fingerprint(appSecret),
        detail: `Meta rejected the credentials: ${message}`,
      };
    }
    return {
      ok: true,
      tokenAppId: appId,
      appSecretFingerprint: fingerprint(appSecret),
      detail: appId
        ? `Signed writes verified against app ${appId}.`
        : "Signed writes verified.",
    };
  } catch (err) {
    return {
      ok: false,
      detail: `Could not reach Meta to check the credentials — ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
