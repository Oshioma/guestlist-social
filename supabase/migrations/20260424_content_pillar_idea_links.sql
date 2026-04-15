-- Link content pillars to video/carousel/story ideas so each idea can be
-- bucketed into a pillar on the ideas management pages, and track which
-- proofer post consumed an idea so the idea can be marked as "used" on the
-- relevant manage page.

begin;

-- video_ideas ------------------------------------------------------------

alter table public.video_ideas
  add column if not exists pillar_id uuid
    references public.content_pillars(id) on delete set null,
  add column if not exists used_in_post_id uuid
    references public.proofer_posts(id) on delete set null;

create index if not exists video_ideas_pillar_id_idx
  on public.video_ideas (pillar_id);

create index if not exists video_ideas_used_in_post_id_idx
  on public.video_ideas (used_in_post_id);

-- carousel_ideas ---------------------------------------------------------

alter table public.carousel_ideas
  add column if not exists pillar_id uuid
    references public.content_pillars(id) on delete set null,
  add column if not exists used_in_post_id uuid
    references public.proofer_posts(id) on delete set null;

create index if not exists carousel_ideas_pillar_id_idx
  on public.carousel_ideas (pillar_id);

create index if not exists carousel_ideas_used_in_post_id_idx
  on public.carousel_ideas (used_in_post_id);

-- story_ideas ------------------------------------------------------------

alter table public.story_ideas
  add column if not exists pillar_id uuid
    references public.content_pillars(id) on delete set null,
  add column if not exists used_in_post_id uuid
    references public.proofer_posts(id) on delete set null;

create index if not exists story_ideas_pillar_id_idx
  on public.story_ideas (pillar_id);

create index if not exists story_ideas_used_in_post_id_idx
  on public.story_ideas (used_in_post_id);

-- proofer_posts: reverse link so we know which idea (and from which table)
-- was attached to the post, making it easy to release the idea when the
-- post is deleted or its linked idea changes.
alter table public.proofer_posts
  add column if not exists linked_idea_id uuid,
  add column if not exists linked_idea_kind text;

create index if not exists proofer_posts_linked_idea_idx
  on public.proofer_posts (linked_idea_kind, linked_idea_id);

commit;
