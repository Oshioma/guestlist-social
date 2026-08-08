#!/usr/bin/env bash
#
# Apply pending Supabase migrations against the database in $SUPABASE_DB_URL.
#
# Each file in supabase/migrations/*.sql is applied exactly once, tracked by
# filename in public.schema_migrations_applied. Migrations added after the
# tracking table is populated are executed, in filename order, on later merges.
#
# FIRST RUN (tracking table empty) requires an explicit choice — the script
# will NOT silently baseline, because doing so marks every migration as applied
# WITHOUT running it, permanently skipping any the database hasn't actually had.
# Set exactly one of:
#   MIGRATIONS_BASELINE=true   — DB is already fully current; record all current
#                                files as applied, run none.
#   MIGRATIONS_APPLY_ALL=true  — DB is empty/new; actually run every migration.
# (In CI, use the workflow's "first_run_mode" input to set one of these once.)
#
# Why not `supabase db push`: these migrations use date-prefixed names and
# several share a date (e.g. three 20260731_*.sql), so the CLI's timestamp
# version tracking can't tell them apart. Tracking by full filename is exact.
#
# Requires: psql on PATH, and SUPABASE_DB_URL pointing at a reachable Postgres
# URI. NOTE: GitHub-hosted runners are IPv4-only, but Supabase's DIRECT host
# (db.<ref>.supabase.co) is IPv6-only — that connection fails from CI with
# "Network is unreachable". Use the IPv4 Session pooler string instead
# (aws-0-<region>.pooler.supabase.com:5432, user postgres.<ref>).
set -euo pipefail

: "${SUPABASE_DB_URL:?SUPABASE_DB_URL is required}"

MIGRATIONS_DIR="$(cd "$(dirname "$0")/.." && pwd)/supabase/migrations"
PSQL=(psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -X -q)

"${PSQL[@]}" -c "create table if not exists public.schema_migrations_applied (
  filename    text primary key,
  applied_at  timestamptz not null default now()
);"

# Collect migration files sorted by name (lexical == chronological here).
shopt -s nullglob
mapfile -t files < <(ls -1 "$MIGRATIONS_DIR"/*.sql | sort)
if [ "${#files[@]}" -eq 0 ]; then
  echo "No migration files found in $MIGRATIONS_DIR"
  exit 0
fi

count=$("${PSQL[@]}" -tAc "select count(*) from public.schema_migrations_applied")

if [ "$count" = "0" ]; then
  if [ "${MIGRATIONS_BASELINE:-}" = "true" ]; then
    echo "First run + MIGRATIONS_BASELINE=true — recording ${#files[@]} migrations as"
    echo "applied WITHOUT running them (database assumed already current):"
    for f in "${files[@]}"; do
      base=$(basename "$f")
      echo "  baseline: $base"
      "${PSQL[@]}" -c "insert into public.schema_migrations_applied (filename) values ('$base') on conflict do nothing;"
    done
    echo "Baseline complete. Future migrations will be applied automatically on merge."
    exit 0
  elif [ "${MIGRATIONS_APPLY_ALL:-}" = "true" ]; then
    echo "First run + MIGRATIONS_APPLY_ALL=true — applying ALL migrations in order."
    # Fall through to the apply loop below; nothing is tracked yet, so every
    # file is treated as pending and executed.
  else
    {
      echo "ERROR: migration tracking table is empty (first successful run)."
      echo "Refusing to silently baseline: that would mark every migration as applied"
      echo "WITHOUT running it, permanently skipping any the database hasn't had applied."
      echo
      echo "Choose one and re-run (CI: set the workflow's first_run_mode input):"
      echo "  MIGRATIONS_BASELINE=true   — DB is already fully current; record all, run none."
      echo "  MIGRATIONS_APPLY_ALL=true  — DB is empty/new; actually run every migration."
    } >&2
    exit 1
  fi
fi

applied_any=0
for f in "${files[@]}"; do
  base=$(basename "$f")
  exists=$("${PSQL[@]}" -tAc "select 1 from public.schema_migrations_applied where filename = '$base'")
  if [ "$exists" = "1" ]; then
    continue
  fi
  echo "Applying migration: $base"
  # The file manages its own transaction where it needs one; ON_ERROR_STOP
  # aborts (and fails the job) on the first error so a broken migration is
  # never recorded as applied.
  "${PSQL[@]}" -f "$f"
  "${PSQL[@]}" -c "insert into public.schema_migrations_applied (filename) values ('$base');"
  applied_any=1
done

if [ "$applied_any" = "0" ]; then
  echo "No pending migrations — database is up to date."
else
  echo "Migrations applied successfully."
fi
