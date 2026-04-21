create table if not exists client_images (
  id            uuid        primary key default gen_random_uuid(),
  client_id     bigint      not null references clients(id) on delete cascade,
  public_url    text        not null,
  storage_path  text,                        -- set when uploaded via app; null for website scans
  source        text        not null default 'upload',  -- 'upload' | 'website_scan'
  created_at    timestamptz not null default now()
);

create index if not exists client_images_client_id_idx on client_images (client_id);
