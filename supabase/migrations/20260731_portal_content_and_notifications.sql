-- ---------------------------------------------------------------------------
-- Portal Content (proofer) + per-client visibility toggles + notifications.
--
-- This migration powers three things:
--   1. A client-facing "Content" page that mirrors the admin proofer board —
--      clients review, edit, approve, comment on, and add media to their posts.
--   2. Per-client visibility toggles so an operator decides, client by client,
--      which portal sections (Content, Ads, Reviews, Consultation) are shown.
--   3. An in-app notification feed so the operator is told when a client
--      comments, approves, or unapproves a post.
-- ---------------------------------------------------------------------------

begin;

-- ── Per-client portal visibility toggles ─────────────────────────────────
-- Default TRUE preserves today's behavior: existing clients keep seeing the
-- Ads / Reviews / Consultation sections, and the new Content section is on.
alter table public.clients
  add column if not exists portal_show_content boolean not null default true;
alter table public.clients
  add column if not exists portal_show_ads boolean not null default true;
alter table public.clients
  add column if not exists portal_show_reviews boolean not null default true;
alter table public.clients
  add column if not exists portal_show_consultation boolean not null default true;

-- ── Distinguish who wrote a proofer comment ──────────────────────────────
-- Existing comments are all operator-authored; new client comments carry
-- author_role = 'client' so the board can style them and notify the operator.
alter table public.proofer_comments
  add column if not exists author_role text not null default 'admin';

-- ── In-app operator notifications ────────────────────────────────────────
-- One row per client action worth surfacing (comment / approve / unapprove).
-- Admin-only: portal users must never read the agency-wide feed.
-- post_id is stored as text (no FK): proofer_posts predates the migrations
-- folder so its id column type isn't guaranteed here, and a notification
-- outliving its post is harmless.
create table if not exists public.portal_notifications (
  id bigserial primary key,
  client_id bigint not null references public.clients(id) on delete cascade,
  post_id text,
  kind text not null,
  body text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index if not exists portal_notifications_unread_idx
  on public.portal_notifications (read_at, created_at desc);
create index if not exists portal_notifications_client_idx
  on public.portal_notifications (client_id);

alter table public.portal_notifications enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'portal_notifications'
      and policyname = 'portal_notifications_admin'
  ) then
    create policy portal_notifications_admin on public.portal_notifications
      for all to authenticated
      using (public.is_admin()) with check (public.is_admin());
  end if;
end $$;

commit;
