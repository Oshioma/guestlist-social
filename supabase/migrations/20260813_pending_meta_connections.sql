-- Holds the Facebook Pages returned by an OAuth login between the callback and
-- the user picking WHICH Page to attach. Before this, the callback attached
-- every Page a login could see to one account — the "grab-all" that put the
-- wrong accounts everywhere. Now, when a login returns more than one Page, we
-- stash the candidates here briefly and send the user to a chooser; they pick
-- one, we attach only that Page (+ its linked Instagram), and the row is
-- deleted.
--
-- `pages` holds Page access tokens, so like connected_meta_accounts this table
-- is service-role only: RLS enabled with NO policies. Rows are short-lived and
-- cleaned on use (or aged out).

begin;

create table if not exists public.pending_meta_connections (
  nonce            text primary key,
  client_id        bigint not null references public.clients(id) on delete cascade,
  return_to        text,
  pages            jsonb not null,
  token_expires_at timestamptz,
  created_at       timestamptz not null default now()
);

create index if not exists pending_meta_connections_created_idx
  on public.pending_meta_connections (created_at);

alter table public.pending_meta_connections enable row level security;
-- Intentionally NO policies — service-role only (holds Page access tokens).

commit;
