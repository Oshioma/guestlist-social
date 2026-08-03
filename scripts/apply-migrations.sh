#!/usr/bin/env bash
#
# Apply pending Supabase migrations against the database in $SUPABASE_DB_URL.
#
# Each file in supabase/migrations/*.sql is applied exactly once, tracked by
# filename in public.schema_migrations_applied. On the VERY FIRST run (that
# table empty) it BASELINES: every current migration is recorded as applied
# WITHOUT being run, on the assumption the database is already up to date.
# Only migrations added after that baseline are executed on later merges.
#
# Why not `supabase db push`: these migrations use date-prefixed names and
# several share a date (e.g. three 20260731_*.sql), so the CLI's timestamp
# version tracking can't tell them apart. Tracking by full filename is exact.
#
# Requires: psql on PATH, SUPABASE_DB_URL (a direct/session Postgres URI).
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
  echo "First run — baselining ${#files[@]} existing migrations as applied (database assumed current)."
  for f in "${files[@]}"; do
    base=$(basename "$f")
    "${PSQL[@]}" -c "insert into public.schema_migrations_applied (filename) values ('$base') on conflict do nothing;"
  done
  echo "Baseline complete. Future migrations will be applied automatically on merge."
  exit 0
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
