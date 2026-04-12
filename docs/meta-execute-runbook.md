# Meta execution — operator runbook

This is the one-pager for flipping `META_EXECUTE_DRY_RUN=false` and trusting
the queue to make real changes on Meta. Read it once before flipping. Read it
again the first time something looks wrong.

## What the executor will touch

Three actions, deliberately the safest possible writes:

1. **`pause_ad`** — sets an ad's `status` to `PAUSED`. Reversible from Ads
   Manager. Refused if the ad is already paused/deleted/archived.
2. **`increase_adset_budget`** — bumps an ad set's `daily_budget` by the
   approved percent. **Hard-capped at +20%.** Refused if the live budget
   has drifted >5% from what the queue row was created against — that
   triggers a re-approval rather than a stale write.
3. **`duplicate_ad`** — calls `/{ad_id}/copies` with `status_option=PAUSED`.
   The copy never auto-launches. 24h cooldown per source ad.

## What the executor will NOT touch

- Creative edits (image, video, body, headline, CTA)
- Audience swaps
- Automatic launches (every duplicate lands paused)
- Budget *decreases* (only upward; pause an ad if you want to stop spend)
- Campaign-level CBO budgets (refused — the executor only writes adset
  daily budgets)
- Anything not in the three actions above

If a queue row asks for something outside this set, the executor will throw
and mark the row `failed`. That's the design — every dangerous edit lives
behind code review, not the queue.

## Pre-flight checklist

Before flipping the env var, run these in order:

1. **Verify env vars are set in the deploy.** The executor refuses to write
   without all of these:
   - `META_ACCESS_TOKEN` — long-lived system user token with
     `ads_management` permission on the ad account
   - `META_APP_SECRET` — required for `appsecret_proof` signing on every
     write
   - `META_AD_ACCOUNT_ID` — used by the preflight probe (e.g.
     `act_1234567890`)
   - `META_EXECUTE_DRY_RUN` — currently `true` or unset; you'll flip this
     last

2. **Hit the preflight endpoint.** This is read-only and never writes:

   ```
   GET /api/meta-execute-preflight
   ```

   The response shape:

   ```json
   {
     "ok": true,
     "dry_run": true,
     "checks": {
       "access_token": { "ok": true },
       "app_secret":   { "ok": true },
       "signed_read":  { "ok": true, "account": { "id": "act_…", "name": "…" } }
     },
     "next_step": "All checks pass. Set META_EXECUTE_DRY_RUN=false …"
   }
   ```

   - `ok: true` means the signed read against your real ad account
     succeeded — Meta accepts the appsecret_proof you compute, and the
     token has the permissions it needs.
   - `ok: false` means **stop**. Read the per-check `detail` to see what
     to fix. Do not flip the switch with a failing preflight.

3. **Sanity-check the queue UI.** Visit `/app/meta-queue` while still in
   dry-run. The mode banner should say `DRY RUN MODE`. Approve a low-risk
   pending row, click Execute, and confirm the row moves to `recent` with
   `dryRun: true` in the result. Nothing should have changed in Ads
   Manager.

## Flipping the switch

Set the env var in your deploy:

```
META_EXECUTE_DRY_RUN=false
```

Redeploy. The mode banner on `/app/meta-queue` should now read
`LIVE MODE — writes will hit Meta`. Re-run the preflight after deploy to
confirm `dry_run: false` is reflected in the response.

## Approve → execute flow (live)

For each pending queue row:

1. Read the **reason** and **risk_level**. Cross-check against Ads Manager
   if the row has been sitting >12h — Meta state may have moved.
2. Click **Preview**. This re-fetches live ad/adset state through the same
   signing path the execute will use, runs every guard, and updates
   `last_checked_at` / `last_checked_state` on the row. It does **not**
   write. If preview fails, the execute would fail — fix the underlying
   issue (or cancel the row) before clicking Execute.
3. Click **Approve**. The row moves to `approved`. No Meta call yet.
4. Click **Execute**. The route re-runs `assertQueueItemFresh` (24h TTL),
   the per-action guards, refreshes state one more time, then makes the
   signed POST. On success, the row moves to `executed` with the response
   body in `execution_result`. On failure, it moves to `failed` with the
   error in `execution_error`.

If a row sits in `pending`/`approved` for >24h, the executor will refuse
it as stale on the next click. Cancel it and let the engine re-queue with
fresh state.

## Reverting

Reversibility depends on the action:

- **`pause_ad`** — un-pause the ad in Ads Manager directly. There is
  intentionally no `unpause_ad` action in the executor; un-pausing is a
  human decision.
- **`increase_adset_budget`** — set the budget back manually in Ads
  Manager. The original value lives on the queue row in
  `proposed_payload.daily_budget_old` and on the executor result in
  `oldBudgetCents`.
- **`duplicate_ad`** — the duplicate is paused. Either delete it from Ads
  Manager or leave it parked. Nothing else changed.

## Emergency kill-switch

If the executor starts behaving badly, set `META_EXECUTE_DRY_RUN=true` (or
unset it — default is dry-run) and redeploy. Every subsequent Execute click
returns the simulated payload without touching Meta. No code change needed.

For a faster response without a redeploy, you can also revoke or rotate
the `META_ACCESS_TOKEN` in the Meta App dashboard — every signed write
will fail immediately and be marked `failed` with a token error.

## Failure modes you should expect

| Symptom | Cause | Fix |
| --- | --- | --- |
| `Missing META_APP_SECRET` | env var not set | set it, redeploy |
| `appsecret_proof` mismatch | wrong app secret for the token | rotate token under the right app |
| `Queue item is older than 24h` | row sat too long | cancel, let engine re-queue |
| `Live budget drifted N% from expected` | someone edited the adset in Ads Manager between approval and execute | cancel, re-approve from fresh state |
| `Adset has no daily_budget set` | campaign uses CBO | refuse — budget edits go through Ads Manager |
| `Source ad … was already duplicated within the last 24h` | cooldown | wait or skip |
| Executor hangs | Meta API outage | retry later — nothing has been written if you didn't see a `result` |

## Where the code lives

- `lib/meta-execute.ts` — every executor function, every guard, every
  hard cap
- `app/api/meta-execute-decision/route.ts` — the only entry point that
  may call the executors
- `app/api/meta-execute-preflight/route.ts` — read-only health check
- `app/admin-panel/meta-queue/page.tsx` — the operator UI
- `supabase/migrations/20260415_meta_execution_queue.sql` — queue schema

If you need a new action type, add it in this order:

1. Executor function in `lib/meta-execute.ts` (with its own guards + a
   dry-run short-circuit)
2. Dispatcher case in `meta-execute-decision/route.ts`
3. UI rendering in `MetaQueueRow`
4. Update this runbook
