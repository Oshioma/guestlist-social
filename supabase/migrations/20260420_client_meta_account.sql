-- Add per-client Meta ad account ID
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS meta_ad_account_id text;
