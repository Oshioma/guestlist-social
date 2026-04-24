-- Allow 'location' as a discovery search kind. Used to look up real IG
-- posts tagged at a physical location (e.g. "Kendwa Beach") via an
-- Instagram scraper on RapidAPI — higher-freshness, place-specific
-- content than Business Discovery or the keyword search can give us.

begin;

alter table public.interaction_searches
  drop constraint if exists interaction_searches_kind_check;

alter table public.interaction_searches
  add constraint interaction_searches_kind_check
  check (kind in ('handle', 'hashtag', 'mentions', 'keyword', 'location'));

commit;
