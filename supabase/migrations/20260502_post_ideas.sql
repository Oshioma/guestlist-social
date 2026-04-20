-- post_ideas: AI-generated suggestions for proofer calendar slots.
-- Separate from proofer_posts — ideas are staging, posts are production.
-- Multiple ideas can exist per (client, date, platform).

begin;

create table if not exists public.post_ideas (
  id                     uuid        primary key default gen_random_uuid(),
  client_id              bigint      not null references public.clients(id) on delete cascade,
  post_slot_date         date        not null,
  platform               text        not null,
  generation_run_id      uuid,
  prompt_used            text,
  title                  text,
  caption_idea           text,
  image_idea             text,
  cta                    text,
  format                 text,
  hashtags               text,
  first_line             text,
  content_pillar_id      uuid        references public.content_pillars(id) on delete set null,
  -- status: idea (default) | promoted | rejected | weak
  status                 text        not null default 'idea',
  is_weak                boolean     not null default false,
  generated_by           text,
  brand_context_snapshot jsonb,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index if not exists post_ideas_client_date_idx
  on public.post_ideas (client_id, post_slot_date);

create index if not exists post_ideas_client_status_idx
  on public.post_ideas (client_id, status);

-- Admin-only: clients never see raw AI ideas, only proofed posts
alter table public.post_ideas enable row level security;

create policy post_ideas_admin on public.post_ideas
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

commit;
