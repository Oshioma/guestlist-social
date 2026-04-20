-- Track who last saved/edited each proofer post
alter table public.proofer_posts
  add column if not exists updated_by text;
