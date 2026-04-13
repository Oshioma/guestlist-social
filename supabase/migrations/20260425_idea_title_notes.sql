-- Add title + notes fields to video/carousel/story ideas. The existing
-- `idea` column stays as the main concept text; `title` is a short
-- headline and `notes` is free-form context shown alongside in the proofer.

begin;

alter table public.video_ideas
  add column if not exists title text not null default '',
  add column if not exists notes text not null default '';

alter table public.carousel_ideas
  add column if not exists title text not null default '',
  add column if not exists notes text not null default '';

alter table public.story_ideas
  add column if not exists title text not null default '',
  add column if not exists notes text not null default '';

commit;
