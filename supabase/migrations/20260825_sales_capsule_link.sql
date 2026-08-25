-- ---------------------------------------------------------------------------
-- Link pipeline opportunities to Capsule CRM.
--
-- When an opportunity from the Sales pipeline is pushed to Capsule (see
-- "Send to Capsule" on the Opportunities tab), the created/matched Capsule
-- record ids are stored here so the row stays linked: the company name can
-- deep-link into Capsule, and a second push becomes a no-op instead of a
-- duplicate. Both null = not linked.
-- ---------------------------------------------------------------------------

alter table public.sales_opportunities
  add column if not exists capsule_party_id bigint,
  add column if not exists capsule_opportunity_id bigint;
