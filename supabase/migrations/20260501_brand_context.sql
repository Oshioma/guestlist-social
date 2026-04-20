-- Brand context: structured per-client brand knowledge used by AI post generation.
-- Stored as JSONB on clients so it travels with the client record.

alter table public.clients
  add column if not exists brand_context jsonb not null default '{}'::jsonb;
