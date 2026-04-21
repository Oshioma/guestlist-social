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
