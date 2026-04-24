-- Allow 'keyword' as a new discovery search kind. Used by the RapidAPI
-- facebook-scraper3 integration to search Facebook Pages by topic,
-- which fills the gap left by Meta's gated hashtag endpoint.

begin;

alter table public.interaction_searches
  drop constraint if exists interaction_searches_kind_check;

alter table public.interaction_searches
  add constraint interaction_searches_kind_check
  check (kind in ('handle', 'hashtag', 'mentions', 'keyword'));

commit;
