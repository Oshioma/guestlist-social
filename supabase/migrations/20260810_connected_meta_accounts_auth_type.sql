-- Distinguish HOW a connected Instagram account was authorised, because it
-- changes which API host + token we publish with:
--
--   'facebook_page'    — connected via Facebook Login (/api/meta/connect).
--                        Publishing uses the parent Page token against
--                        graph.facebook.com. This is every pre-existing row.
--   'instagram_login'  — connected via Instagram Business Login
--                        (/api/instagram/connect), with NO Facebook Page.
--                        Publishing uses the Instagram *user* token against
--                        graph.instagram.com, and the token needs periodic
--                        refresh (60-day expiry).
--
-- Existing rows are all Facebook-Login, so default to 'facebook_page'.

begin;

alter table public.connected_meta_accounts
  add column if not exists auth_type text not null default 'facebook_page'
  check (auth_type in ('facebook_page', 'instagram_login'));

commit;
