# Guestlist Social

An agency-grade ad ops platform built on Next.js + Supabase. Three products in one admin panel:

1. **Decision Engine** — syncs ad data from Meta, scores every ad, generates recommendations (scale / pause / apply cross-client pattern), queues them for approval, executes against Meta, and measures outcomes.
2. **Social Publisher (Proofer)** — monthly calendar for planning, proofing, and scheduling organic posts to Instagram (Feed + Stories) and Facebook.
3. **Campaign Creator** — form for creating campaigns per-client, with a suggestions sidebar that surfaces winning patterns from the decision engine and past winners.

A read-only **Client Portal** at `/portal/[clientId]` gives clients a view of their ads, reviews, and what changed since the last review.

## Tech stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · Supabase (Postgres + Auth + RLS) · Anthropic Claude (decisions, reviews, playbooks) · Meta Graph API v19 · Zod · tus.js (resumable uploads) · Vercel

## Getting started

```bash
cp .env.example .env.local   # fill in your keys
npm install
npm run dev                   # http://localhost:3000
```

### Required env vars

See [`.env.example`](.env.example) for the full list. At minimum you need:

- `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` + `SUPABASE_SERVICE_ROLE_KEY`
- `META_ACCESS_TOKEN` + `META_AD_ACCOUNT_ID` (for ad sync)
- `ANTHROPIC_API_KEY` (for decision engine)

### Supabase migrations

Migrations live in `supabase/migrations/`. Apply them in date order against your Supabase project.

## Project structure

```
app/
  admin-panel/       operator admin — dashboard, clients, ads, proofer, campaigns
  portal/            read-only client view
  api/               API routes (meta-sync, decisions, publishing, cron jobs)
  (auth)/            sign-in / sign-up / forgot-password / reset-password / accept-invite
  auth/callback/     Supabase PKCE + OTP return handler
  sign-out/          POST-only logout
lib/                 shared: meta client, supabase client, cross-pollinate, patterns
lib/auth/            auth server actions + permission helpers (getMemberAccess, requireAdsAccess)
supabase/migrations/ schema migrations (date-ordered SQL files)
docs/                product-overview.md, auth.md
```

## Documentation

- [`docs/product-overview.md`](docs/product-overview.md) — the three apps, data model, current status, MVP punch list.
- [`docs/auth.md`](docs/auth.md) — how the login / member-admin / ads-access module works and how to port it to another Next.js app.
