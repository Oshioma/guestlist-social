-- Per-client Facebook Page identity, so organic posts can be pinned to the
-- intended Page the same way `ig_handle` pins Instagram.
--
-- A single Meta login can administer many brands' Pages, and the OAuth
-- connect flow stores every one of them under the connecting client. Without
-- a declared target the publisher had to guess which Page a post was for,
-- which let posts go out on the wrong account. This column is the operator's
-- declaration of "this client's Facebook Page" — matched at publish time
-- against the connected Page's name or id. Nullable: unset simply means the
-- publisher only allows a single connected Page (and blocks if ambiguous).

alter table public.clients add column if not exists fb_page text;
