-- ---------------------------------------------------------------------------
-- Policies for the dashboard-created tables the RLS sweep locked down.
--
-- 20260826_enable_rls_everywhere enabled RLS (deny-by-default) on the 14
-- tables Supabase's advisor flagged — all created outside this repo's
-- migrations. An audit of the app's access to them:
--
--   Session client (RLS applies)  → needs a policy:
--     learnings         — staff learning library (learning-actions, clients
--                         pages, save-learning)
--     ad_snapshots      — ad metric history (snapshot-actions, rule-actions)
--     review_approvals  — review approval trail (admin review page)
--
--   Service role only (bypasses RLS) → stays closed, correctly:
--     ad_placement_insights, ad_demographic_insights, action_outcomes
--
--   Not referenced by the app at all → stays closed:
--     schema_migrations_applied, proofer_publish_jobs, campaign_steps,
--     task_comments, task_activity, task_notifications, task_memberships,
--     and proofer_connected_accounts — the one the advisor flagged for an
--     exposed access_token column; nothing reads it, so it stays sealed
--     (its successor, connected_meta_accounts, already has policies).
--
-- All three surfaces are agency-staff-only, so the policy is the standard
-- staff-wide one (is_admin() = any admitted admin-panel member), matching
-- cashflow and the sales tables. Every block is guarded on the table
-- actually existing: these tables live only in environments where they were
-- hand-created, so a fresh database skips them cleanly. Re-runnable.
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['learnings', 'ad_snapshots', 'review_approvals'] loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I enable row level security', t);
      execute format('drop policy if exists %I on public.%I', t || '_staff_all', t);
      execute format(
        'create policy %I on public.%I for all using (public.is_admin()) with check (public.is_admin())',
        t || '_staff_all', t
      );
    end if;
  end loop;
end $$;
