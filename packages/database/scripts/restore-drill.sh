#!/usr/bin/env bash
#
# restore-drill.sh — Validate a PostgreSQL backup by restoring to a temp database
#
# Usage:
#   ./packages/database/scripts/restore-drill.sh backup.sql
#   ./packages/database/scripts/restore-drill.sh --from-db postgresql://user@host/barstock
#
set -euo pipefail

TEMP_DB="barstock_restore_test"
DUMP_FILE=""
FROM_DB=""

# ─── Parse args ──────────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --from-db)
      FROM_DB="$2"
      shift 2
      ;;
    *)
      DUMP_FILE="$1"
      shift
      ;;
  esac
done

if [[ -z "$DUMP_FILE" && -z "$FROM_DB" ]]; then
  echo "Usage: $0 <backup.sql> | --from-db <database-url>"
  exit 1
fi

# ─── If --from-db, dump first ────────────────────────────────────────────────
if [[ -n "$FROM_DB" ]]; then
  DUMP_FILE="$(mktemp /tmp/barstock-drill-XXXXXX.sql)"
  echo "Dumping from $FROM_DB ..."
  pg_dump "$FROM_DB" --no-owner --no-acl -f "$DUMP_FILE"
  echo "Dump saved to $DUMP_FILE"
fi

if [[ ! -f "$DUMP_FILE" ]]; then
  echo "ERROR: Backup file not found: $DUMP_FILE"
  exit 1
fi

# ─── Cleanup handler ─────────────────────────────────────────────────────────
cleanup() {
  echo ""
  echo "Cleaning up: dropping $TEMP_DB ..."
  dropdb --if-exists "$TEMP_DB" 2>/dev/null || true
  if [[ -n "$FROM_DB" && -f "$DUMP_FILE" ]]; then
    rm -f "$DUMP_FILE"
  fi
}
trap cleanup EXIT

# ─── Create temp database ────────────────────────────────────────────────────
echo "Creating temp database $TEMP_DB ..."
dropdb --if-exists "$TEMP_DB" 2>/dev/null || true
createdb "$TEMP_DB"

# ─── Restore ─────────────────────────────────────────────────────────────────
echo "Restoring backup into $TEMP_DB ..."
psql -d "$TEMP_DB" -f "$DUMP_FILE" --quiet --single-transaction 2>&1 | tail -5
echo "Restore complete."

# ─── Health checks ───────────────────────────────────────────────────────────
PASS=0
FAIL=0

check_table() {
  local table="$1"
  local min_rows="${2:-0}"

  local count
  count=$(psql -d "$TEMP_DB" -tAc "SELECT COUNT(*) FROM $table" 2>/dev/null || echo "ERROR")

  if [[ "$count" == "ERROR" ]]; then
    echo "  FAIL  $table — table missing or query error"
    ((FAIL++))
    return
  fi

  if [[ "$count" -ge "$min_rows" ]]; then
    echo "  PASS  $table — $count rows"
    ((PASS++))
  else
    echo "  FAIL  $table — $count rows (expected >= $min_rows)"
    ((FAIL++))
  fi
}

echo ""
echo "Running health checks ..."

# Total table count
TABLE_COUNT=$(psql -d "$TEMP_DB" -tAc "
  SELECT COUNT(*) FROM information_schema.tables
  WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
")
echo "  Tables in restored DB: $TABLE_COUNT"
if [[ "$TABLE_COUNT" -ge 10 ]]; then
  echo "  PASS  table count >= 10"
  ((PASS++))
else
  echo "  FAIL  table count $TABLE_COUNT < 10"
  ((FAIL++))
fi

# Key tables with minimum expected rows
check_table "businesses" 1
check_table "locations" 1
check_table "users" 1
check_table "inventory_items" 0
check_table "consumption_events" 0
check_table "inventory_sessions" 0
check_table "audit_logs" 0
check_table "inventory_item_categories" 1

# Referential integrity spot check
FK_CHECK=$(psql -d "$TEMP_DB" -tAc "
  SELECT COUNT(*) FROM users u
  LEFT JOIN businesses b ON b.id = u.business_id
  WHERE u.business_id IS NOT NULL AND b.id IS NULL
" 2>/dev/null || echo "ERROR")
if [[ "$FK_CHECK" == "0" ]]; then
  echo "  PASS  users→businesses FK integrity"
  ((PASS++))
else
  echo "  FAIL  users→businesses FK integrity — $FK_CHECK orphaned rows"
  ((FAIL++))
fi

# ─── Summary ─────────────────────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════"
echo "  Results: $PASS passed, $FAIL failed"
echo "════════════════════════════════════"

if [[ "$FAIL" -gt 0 ]]; then
  echo "DRILL FAILED"
  exit 1
else
  echo "DRILL PASSED"
  exit 0
fi
