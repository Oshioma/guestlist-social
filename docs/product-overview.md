# Guestlist Social — Product Overview

A Next.js + Supabase platform for running paid-social operations end-to-end.
It bundles three connected products into one admin panel (with a read-only
client portal):

1. **Decision Engine** — reads ad-spend results from Meta and recommends
   (or executes) next actions.
2. **Social Publisher (Proofer)** — plans, proofs, schedules and publishes
   organic posts to Instagram and Facebook.
3. **Campaign Creator** — a form + engine-suggestions panel that helps build
   Facebook/Instagram ad campaigns for a specific client.

> Consolidation note: this branch merges the previously-parallel work from
> `claude/integrate-admin-app-LKPUH` (decision engine: reaper, pattern
> feedback, bulk scale, plain-English UI) and
> `claude/client-content-dashboard-VEf8L` (social publisher: proofer polish,
> content pillars, connected_meta_accounts OAuth, auto-publish cron). The
> two streams had diverged at `e0ae57d`; conflicts were resolved in favour
> of the more recent engine-side revalidation paths
> (`/admin-panel/*` rather than the silently-broken `/app/*`) while
> keeping all the richer proofer action helpers from the social stream.

---

## 1. Tech Stack

| Layer | Choice |
|---|---|
| Framework | **Next.js 16.1** (App Router, RSC, Server Actions) |
| Language | **TypeScript 5** |
| UI | **React 19**, **Tailwind CSS 4** (inline CSS-in-JS on many components) |
| Data / Auth | **Supabase** (Postgres + RLS + Auth, `@supabase/ssr`) |
| LLM | **Anthropic Claude** (`@anthropic-ai/sdk`) — decisions, reviews, playbooks |
| Ads API | **Meta Graph API v25** (direct `fetch`, no SDK) |
| Validation | **Zod** |
| Uploads | **tus.js** (resumable) |
| Hosting | **Vercel** (+ cron via `vercel.json`) |

Key env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `META_ACCESS_TOKEN`, `META_AD_ACCOUNT_ID`,
`META_SOCIAL_APP_ID` (+ secret/redirect URI for the social-publisher OAuth),
`ANTHROPIC_API_KEY`, SMTP creds.

---

## 2. Site Structure

```
/                       marketing homepage
/sign-in, /sign-up, /forgot-password, /reset-password   Supabase auth
/auth/callback          PKCE code exchange (email verify + password recovery)
/sign-out               POST — clears session, redirects to /sign-in
/post-login             role-based redirect (admin → /app/dashboard, client → /portal/{id})
/app → /admin-panel     agency admin (next.config rewrite)
/portal/[clientId]      read-only client view
/r/[token]              public share links for reviews
/privacy                static
```

### Admin panel (high level)

The sidebar is grouped into product areas:

**Workspace** — Dashboard, Clients.
**Engine** — Meta queue, Playbook, Creative library, Reports, Memory.
**Publisher** — Proofer (calendar), Publish queue, Ideas (tabbed: Video /
Carousel / Story), Content (dashboard).
**Campaigns** — Quick launch.
**Utility** — Tasks, Settings, Guide.

Key surfaces:
- `/dashboard` — cross-client growth engine dashboard, includes
  `WhatsWorkingNow`, `TopPriorities`, `PatternFeedbackPanel` and the
  "engine activity strip".
- `/clients/[id]/campaigns/new` — campaign form + engine-suggestions sidebar.
- `/proofer`, `/proofer/publish` — organic scheduling & publishing.
- `/ideas` — combined ideas board with tabs for Video / Carousel / Story.
- `/creative` — strategist-grade creative library.

### Auth & roles
Middleware (`middleware.ts`) gates `/app` and `/admin-panel`. A user's row(s)
in `client_user_links` determine whether they are:
- **Admin** — no link rows → full admin panel.
- **Portal client** — has link rows → bounced to their `/portal/[clientId]`.

`connected_meta_accounts` is service-role only; tokens never reach the browser.

---

## 3. App 1 — Decision Engine

### What it does
Pulls campaign + ad performance from Meta, scores each ad, generates
recommendations ("scale this winner", "pause this loser", "apply the pattern
that worked for another client"), queues them for human approval, executes
approved ones against Meta, and measures whether the change actually
improved outcomes. The stale-pattern reaper retires patterns whose track
record has gone bad.

### Key UI
- `app/admin-panel/clients/[clientId]/ads/page.tsx` — tabbed interface
  (Ads / Actions & Decisions / Playbook / Experiments) via `AdsPageTabs`.
  All sections server-rendered; tab switching is CSS display-toggle.
- `app/admin-panel/meta-queue/` — approval queue for Meta writes.
- `app/admin-panel/dashboard/` — `WhatsWorkingNow` + `TopPriorities` +
  pattern feedback panel + engine activity strip.
- Components: `DecisionRow`, `DecisionAccuracy`, `AdActionRow`,
  `MetaQueueRow`, `GenerateDecisionsButton`, `ScoreAndGenerateButton`,
  `TopPriorities`, `WhatsWorkingNow`, `PatternFeedbackPanel`,
  `EngineActivityStrip`, `ReaperBanner`.

### Key API routes
- `POST /api/meta-sync` — pulls campaigns, ads, insights, daily snapshots.
- `POST /api/score-ads` — scores ads by CTR/CPC/conv/spend.
- `POST /api/generate-decisions` — rule + pattern engine produces pending
  `ad_decisions`.
- `POST /api/meta-execute-preflight` — dry run.
- `POST /api/meta-execute-decision` — approve / preview / execute / cancel.
- `GET  /api/measure-decision-outcomes` — closed-loop feedback (also
  scheduled as a Vercel cron).
- `POST /api/generate-global-learnings`, `POST /api/generate-playbook`,
  `POST /api/cross-pollinate` — learning synthesis.
- `POST /api/queue-all-winners`, `POST /api/queue-budget-bump`,
  `POST /api/queue-budget-pullback` — bulk engine actions.
- `POST /api/unretire-pattern` — operator override for the reaper.
- `GET  /api/cron/retire-stale-patterns` — weekly reaper cron.

### Lib
- `lib/meta.ts` — Graph client (campaigns, ads, ad sets, insights, daily
  insights, creative helpers).
- `lib/meta-queue-seed.ts`, `lib/pattern-feedback.ts`,
  `lib/pattern-phrases.ts`, `lib/decision-outcomes.ts`,
  `lib/cross-pollinate.ts`.
- `app/admin-panel/lib/performance-truth.ts`, `decision-engine.ts`,
  `action-confidence.ts`, `action-engine.ts`, `meta-execute.ts`.

### Data model
`ads`, `campaigns`, `ad_decisions`, `meta_execution_queue`, `ad_actions`,
`action_learnings`, `global_learnings` (with `industry` + `prev_consistency_score`),
`pattern_feedback`, `pattern_feedback_retired`, `client_playbooks`,
`experiments`, `experiment_variants`, `reports`.

### Status
Most mature product. Full sync → score → decide → approve → execute →
measure → reap loop is wired up. Thresholds are now tunable from settings
(reaper). Pattern feedback panel renders plain-English learning state.
`decision-accuracy` visualization is still experimental.

---

## 4. App 2 — Social Publisher (Proofer)

### What it does
A monthly calendar where the team drafts posts per client, runs them
through a review workflow (improve → check → proofed → approved), and then
schedules/publishes to Facebook or Instagram via the Graph API. Supports
image/video/carousel media, content pillars, threaded comments per post,
and inline notes editing.

### Key UI
- `app/admin-panel/proofer/page.tsx` + `ProoferBoard.tsx` — calendar board,
  month picker, client selector, drag/drop, status workflow (traffic-light
  dots), comments, pillar picker with coloured dropdowns.
- `app/admin-panel/proofer/publish/page.tsx` + `PublishQueueBoard.tsx` —
  ready queue, scheduled queue, connected-Meta-account picker,
  publish/schedule actions, error surfacing.
- `app/admin-panel/carousel-ideas/`, `story-ideas/`, `video-ideas/`,
  plus `PillarManager` in settings.

### Key API / lib
- `POST /api/meta/connect`, `GET /api/meta/callback` — OAuth to store
  long-lived page tokens in `connected_meta_accounts`.
- `GET  /api/cron/publish-meta-queue` — cron (every 5 min) that executes
  scheduled posts.
- `GET  /api/meta/debug-env` — OAuth-config diagnostic.
- `lib/meta-publish.ts` — `publishMetaQueueItem`, `publishFacebookPost`,
  `publishInstagramPost`, `publishInstagramStory`, error/result persistence.
- `lib/proofer-actions.ts` — server actions for post CRUD & status moves,
  plus comment/idea/pillar helpers. Revalidation goes through
  `revalidateProoferPaths` / `revalidatePillarConsumers` helpers.
- `lib/meta-auth.ts` — service-role Supabase client for token access.

### Data model
`proofer_posts`, `proofer_publish_queue`, `proofer_comments`,
`proofer_ideas`, `proofer_idea_title_notes`, `content_pillars`,
`content_pillar_idea_links`, `connected_meta_accounts`.

### Status
Feature-complete for IG Feed, IG Stories, and FB Feed. Scheduling +
publishing work via cron. Content pillars and idea linking are fully wired
through the proofer and the combined Ideas page (tabbed: Video / Carousel /
Story). TikTok and LinkedIn have been removed from the platform enum — no
backing code existed. Post-publish performance tracking is not built.

---

## 5. App 3 — Campaign Creator

### What it does
Lets the operator create a campaign for a specific client via a single
form (`CampaignForm`) backed by the `createCampaignAction` server action.
**New:** the form is now wrapped by `CampaignCreator`, which adds a
suggestions sidebar pulled from the decision engine. The operator can
apply a pattern with one click and the form is pre-filled — they can still
edit everything before saving.

Note: the older 4-step `FacebookAdWizard` / `AudiencePicker` that
appeared in earlier sketches never landed in the modern tree; the current
shape is a single-form creator plus the new suggestions panel. That's
intentional — we're not rebuilding.

### Key UI
- `app/admin-panel/clients/[clientId]/campaigns/new/page.tsx` — new campaign
  page, fetches suggestions and renders `CampaignCreator`.
- `app/admin-panel/components/CampaignCreator.tsx` — 2-column layout: form
  on the left, suggestions sidebar on the right. Keeps `CampaignForm`
  untouched so the edit page continues to work unchanged.
- `app/admin-panel/components/CampaignForm.tsx` — 5-field form (name,
  objective, budget, audience, status).
- `app/admin-panel/clients/[clientId]/campaigns/[campaignId]/edit/page.tsx`
  — still uses `CampaignForm` directly.
- `app/admin-panel/components/AssignCampaignButton.tsx`,
  `UnassignedCampaigns.tsx` — assign unassigned Meta campaigns to clients
  after a sync.

### Decision engine → campaign creator connection
`app/admin-panel/lib/campaign-suggestions.ts` exposes
`getCampaignSuggestions(clientId)` which returns three ranked streams:

1. **This client's playbook** — top rows from `client_playbooks`, ranked
   by `avg_reliability`. Audience-category rows prefill the audience field.
2. **Agency playbook** — rows from `global_learnings` with
   `unique_clients ≥ 2`, ranked by `consistency_score × unique_clients`.
   Industry-matching rows are promoted above agency-wide rows.
3. **Clone a past winner** — the client's own `performance_status = 'winner'`
   ads with `spend > 0`, ordered by `performance_score`. The card prefills
   name (as `"<ad name> — retest"`), objective, audience, and budget.

Clicking Apply updates React state in `CampaignCreator` and bumps a `key`
prop on `CampaignForm`, which re-mounts the form with new `initialValues`.
No changes to `CampaignForm` itself.

### Key API / lib
- `POST /api/admin-panel/campaigns` (if present) / `createCampaignAction` —
  writes the `campaigns` row and redirects.
- `POST /api/assign-campaign` — assign an unassigned Meta campaign.
- `lib/campaign-actions.ts`, `lib/assign-campaign-actions.ts`,
  `lib/campaign-suggestions.ts`.

### Data model
`campaigns` (`client_id`, `meta_id`, `name`, `objective`, `budget`,
`status`, `audience`, `meta_status`). Launches live inside `campaigns`.

### Status
Form + server action are stable. The suggestions panel is new on this
branch and closes the feedback loop: the engine that tells you what worked
is now the same thing that tells you how to set up the next campaign. A
real Meta-API campaign create from this form is still not wired (today
it only inserts a local row); that remains on the MVP punch list.

---

## 6. Shared Infrastructure

- **Meta sync** — `POST /api/meta-sync` upserts campaigns/ads/insights by
  `meta_id`, preserving manual `client_id` assignment.
- **Meta execution guards** — `lib/meta-execute.ts` checks state freshness,
  enforces cooldowns, and per-account rate limits.
- **Async jobs** — `jobs` table + `/api/job-status` + `/api/run-pipeline`.
- **Uploads** — `POST /api/upload` with tus.js.
- **Email** — `lib/email.ts`, used for monthly review delivery (SMTP).
- **Cron** — `/api/cron/monthly-reviews` (monthly), `/api/measure-decision-outcomes`
  (every 6h), `/api/cron/retire-stale-patterns` (weekly), `/api/cron/publish-meta-queue`
  (every 5 min).
- **LLM** — Anthropic Claude used inside decision/review/playbook routes.

---

## 7. Known Scaffolds / Gaps

- `/admin-panel/settings` is populated for the reaper tuning UI, but
  other settings (threshold tuning for CTR/CPC, connected Meta accounts
  UI) still need work.
- `/admin-panel/reports` is a shell only.
- Decision Accuracy dashboard tile — schema exists, viz incomplete.
- Campaign Creator writes only to the local DB; it does not yet call Meta
  to actually create a campaign/adset/ad. Suggestions panel closes the
  knowledge loop but not the execution loop.

---

## 8. MVP Punch List

### App 1 — Decision Engine (closest to done)
1. Render outcome-measurement results on the ad page / dashboard.
2. Finish the Decision Accuracy tile.
3. Auto-approve low-risk/high-confidence decisions with audit log.
4. Threshold-config admin UI (CTR/CPC/pattern consistency).
5. Hard-reject stale approvals (preflight snapshot older than N minutes).
6. ~~Split the large `clients/[clientId]/ads/page.tsx` into tabs.~~ **Done.**
7. Standard error banner + retry for `meta-execute-decision` failures.

### App 2 — Social Publisher
1. End-to-end publish test against a real IG Business + FB Page (carousel).
2. Carousel visual preview before publish.
3. Last-run / retry indicator for `/api/cron/publish-meta-queue`.
4. Store returned Meta post ID and fetch insights at 24h / 7d; surface
   reach/engagement on the calendar card.
5. Token-refresh / expiry warnings on `connected_meta_accounts`.
6. Comment workflow: resolved filter + @mentions.
7. ~~Implement IG Stories path or remove from the enum.~~ **Done** — `publishInstagramStory()` added.
8. ~~Remove TikTok from the UI until v2.~~ **Done** — TikTok + LinkedIn removed from platform enums.
9. Wire `api/upload` into the composer (replace Drive-link notes).

### App 3 — Campaign Creator
1. **Actually create the campaign in Meta.** Add `lib/meta-campaign-create.ts`:
   `createCampaign`, `createAdSet`, `createAdCreative`, `createAd`; persist
   returned Meta IDs on the local `campaigns`/`ads` rows.
2. Creative asset picker using `creatives` + `/api/upload`.
3. Real audience targeting payload — map the audience string to Meta's
   `targeting` spec (geo, age, genders, interests, saved/lookalike audiences).
4. Saved + lookalike audience loader from `/act_{id}/customaudiences`.
5. Scheduling fields → proper date/time pickers → `start_time`/`end_time`.
6. Preflight / dry-run validation (budget minimums, required fields, token
   scopes, pixel) — reuse the `meta-execute-preflight` pattern.
7. Extend the suggestions panel: click-to-clone a past winner should also
   carry the ad creative ref (image/video/headline) once Meta-side
   creation lands.
8. Surface specific Meta errors (rejected creative, missing permission,
   low budget) in the creator.

### Cross-cutting
1. Finish `/admin-panel/settings` — connected Meta accounts, Anthropic key
   status, SMTP status, engine thresholds.
2. `meta_write_log` table for every Meta write (decision exec, publish,
   campaign create) with request + response + duration.
3. RLS review on `proofer_posts`, `proofer_publish_queue`, `ad_decisions`,
   `meta_execution_queue` before giving portal users any write paths.
4. ~~Add `.env.example`.~~ **Done.**
5. One Playwright/Cypress smoke test per app: generate a decision,
   schedule a post, create a campaign with a suggestion applied.
6. ~~Replace the boilerplate README with a real overview + local-dev guide.~~ **Done.**
