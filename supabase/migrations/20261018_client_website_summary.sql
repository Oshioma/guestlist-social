-- AI-written brand brief from the client's website (Clients → edit →
-- "Website brand summary"). Used as brand knowledge by post-idea generation
-- and caption rewrites.
alter table public.clients
  add column if not exists website_summary text,
  add column if not exists website_summary_at timestamptz;
