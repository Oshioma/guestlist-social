-- Images pulled from a client's website (via the "Scan website" tool)
create table if not exists client_site_images (
  id            uuid        primary key default gen_random_uuid(),
  client_id     bigint      not null references clients(id) on delete cascade,
  public_url    text        not null,
  created_at    timestamptz not null default now()
);

create index if not exists client_site_images_client_id_idx on client_site_images (client_id);

-- Images manually uploaded by the team for a client
create table if not exists client_upload_images (
  id            uuid        primary key default gen_random_uuid(),
  client_id     bigint      not null references clients(id) on delete cascade,
  public_url    text        not null,
  storage_path  text        not null,
  created_at    timestamptz not null default now()
);

create index if not exists client_upload_images_client_id_idx on client_upload_images (client_id);

-- RLS: match the pattern used for proofer_posts and other client-data tables.
-- Admins have full access; portal users can only read their linked clients.
alter table public.client_site_images enable row level security;

create policy client_site_images_admin_all on public.client_site_images
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy client_site_images_portal_select on public.client_site_images
  for select to authenticated
  using (client_id in (select public.visible_client_ids()));

alter table public.client_upload_images enable row level security;

create policy client_upload_images_admin_all on public.client_upload_images
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy client_upload_images_portal_select on public.client_upload_images
  for select to authenticated
  using (client_id in (select public.visible_client_ids()));
