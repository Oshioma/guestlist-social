-- Meta execution queue.
--
-- A persisted, approval-gated queue for any change the system wants to push
-- to Meta. Nothing is allowed to call the Meta write endpoints directly —
-- the scoring engine queues a row, a human approves it in the admin UI,
-- the executor route re-checks Meta state, and only then does the write
-- happen. The queue is the audit trail.
--
-- Status state machine:
--   pending   → proposed by the engine, awaiting human approval
--   approved  → human signed off, ready for the executor to pick up
--   executed  → executor wrote to Meta successfully (also sets executed_at,
--               execution_result)
--   failed    → executor tried and Meta rejected, OR a hard guard tripped
--               (also sets execution_error)
--   cancelled → human declined / queue item expired before approval
--
-- Risk levels are advisory — the executor has its own hard caps that
-- don't trust this column.

create table if not exists meta_execution_queue (
  id bigserial primary key,

  -- What this change targets. Either ad_id or campaign_id may be null
  -- depending on decision_type — duplicate_ad has both, increase_adset_budget
  -- has neither (it's adset-scoped, by Meta id only).
  client_id bigint references clients(id) on delete cascade,
  campaign_id bigint references campaigns(id) on delete set null,
  ad_id bigint references ads(id) on delete set null,

  -- Raw Meta object ids — these are what the executor actually POSTs to.
  -- We store them separately from our local FKs because Meta ids survive
  -- our local row being deleted.
  adset_meta_id text,
  ad_meta_id text,

  -- One of: pause_ad | increase_adset_budget | duplicate_ad
  -- (more types added later — keep this open as text rather than enum so
  -- migrations don't have to grow).
  decision_type text not null,

  -- The full proposed write. Shape depends on decision_type:
  --   pause_ad:               { status: "PAUSED" }
  --   increase_adset_budget:  { daily_budget_old, daily_budget_new, percent_change }
  --   duplicate_ad:           { new_name_suffix?, creative_overrides? }
  proposed_payload jsonb,

  -- Why the engine wants this — surfaces in the approval UI.
  reason text,

  -- low | medium | high — used in the approval card to flag attention.
  risk_level text default 'low',

  -- pending | approved | executed | failed | cancelled
  status text not null default 'pending',

  -- Approval trail.
  approved_by text,
  approved_at timestamp with time zone,

  -- Execution trail.
  executed_at timestamp with time zone,
  execution_result jsonb,
  execution_error text,

  -- "Last checked" timestamp — the executor refreshes this every time it
  -- re-fetches Meta state, even on dry-run. The approval card shows this
  -- so the operator can see if the queue item is fresh or stale.
  last_checked_at timestamp with time zone,
  last_checked_state jsonb,

  created_at timestamp with time zone default now()
);

create index if not exists idx_meta_execution_queue_status
  on meta_execution_queue(status);
create index if not exists idx_meta_execution_queue_client
  on meta_execution_queue(client_id);
create index if not exists idx_meta_execution_queue_ad
  on meta_execution_queue(ad_id);

-- ---------------------------------------------------------------------------
-- Hard caps live in code, but we record execution events here so the
-- executor can enforce per-account / per-action rate limits without
-- relying on a separate counter store. The executor reads
-- `meta_execution_queue` filtered by status='executed' and a window.
-- ---------------------------------------------------------------------------
