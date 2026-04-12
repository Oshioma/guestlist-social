-- ---------------------------------------------------------------------------
-- client_user_links — bridge Supabase auth users to clients.
--
-- The admin app uses a single global auth pool. To give a client a
-- read-only "portal" view scoped to *their* data, we need a way to say
-- "this auth user is the contact for this client".
--
-- One row per (user, client). A user with no rows is treated as an admin
-- (legacy behavior preserved). A user with one or more rows is a portal
-- user — currently we only consume the first link, but the table is
-- shaped to allow multi-tenant viewers later (e.g. an agency partner
-- who logs in once and sees several clients).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS client_user_links (
  id bigserial PRIMARY KEY,
  auth_user_id uuid NOT NULL,
  client_id bigint NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'viewer',
  created_at timestamp with time zone DEFAULT now(),
  UNIQUE (auth_user_id, client_id)
);

CREATE INDEX IF NOT EXISTS client_user_links_auth_user_idx
  ON client_user_links (auth_user_id);
