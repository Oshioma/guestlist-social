-- Raise the per-bucket upload ceiling to match the app's video limits.
--
-- The upload UI allows videos up to MAX_VIDEO_BYTES_DEFAULT (200 MB) and
-- MAX_VIDEO_BYTES_AGENCY (500 MB) — see lib/billing/plans.ts — but the buckets
-- were capped at 30 MB (postimages) and 25 MB (gsocial), so larger videos were
-- rejected by Storage with "413 Maximum size exceeded" from the TUS endpoint.
--
-- The bucket limit is set to the highest plan ceiling; the per-plan limit is
-- still enforced in the upload UI. The project-wide storage upload limit
-- (Dashboard → Storage → Settings) must also be at least this large.
update storage.buckets
set file_size_limit = 500 * 1024 * 1024 -- 500 MB
where id in ('postimages', 'gsocial');
