#!/usr/bin/env bash
# Measures the analytics queries in four states on the same 1M-row database (see docs/evidence/ENVIRONMENT.md):
#   A  original queries, no (user_id, started_at) index
#   B  original queries, index added
#   C  rewritten range queries, index present      (what the app runs now)
#   D  rewritten range queries, no index           (isolates the rewrite)
# Needs the benchmark database from the evidence run: DB_* in the environment, container name in $BENCH_CONTAINER.
set -eu
cd "$(dirname "$0")/../../server"
OUT=../docs/evidence/raw
C="${BENCH_CONTAINER:-dt-bench}"
psql() { docker exec "$C" psql -U postgres -d "$DB_NAME" -qAc "$1"; }
RUNS=15
IDX=idx_tab_activity_user_started
LEGACY_NAMES=$(node -e 'import("./scripts/bench/legacy.js").then(m=>console.log(Object.keys(m.LEGACY).join(" ")))')
NEW_NAMES=$(node -e 'import("./models/analyticsModel.js").then(m=>{const {week,...r}=m.SQL;console.log([...Object.keys(r),"timeSpentDaily","tabSwitchesDaily"].join(" "))})')

state() { # name mode drop?
  local name=$1 mode=$2 index=$3
  if [ "$index" = "no" ]; then psql "DROP INDEX IF EXISTS $IDX"; else psql "CREATE INDEX IF NOT EXISTS $IDX ON tab_activity (user_id, started_at)"; fi
  psql "ANALYZE tab_activity"
  psql "SELECT indexname FROM pg_indexes WHERE tablename='tab_activity' ORDER BY 1" > "$OUT/analytics-$name-indexes.txt"
  node scripts/bench/analytics.js "$mode" --runs $RUNS > "$OUT/analytics-$name-timings.txt" 2>&1
  local names=$LEGACY_NAMES; [ "$mode" = "new" ] && names=$NEW_NAMES
  : > "$OUT/analytics-$name-plans.txt"
  for q in $names; do node scripts/bench/analytics.js "$mode" --runs 1 --explain "$q" 2>&1 | sed -n '/--- plan/,/^$/p' >> "$OUT/analytics-$name-plans.txt"; done
  echo "state $name done"
}

state A legacy no
state B legacy yes
state C new yes
state D new no
psql "CREATE INDEX IF NOT EXISTS $IDX ON tab_activity (user_id, started_at)"
psql "ANALYZE tab_activity"
