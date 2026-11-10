#!/usr/bin/env bash
# Proves a backup can really be restored, WITHOUT touching live data: restores into a scratch database, counts rows, drops it.
#   ./scripts/restore-test.sh backups/nexora-20261109-020000.dump      (do this monthly)
set -euo pipefail
cd "$(dirname "$0")/.."
FILE="${1:?usage: scripts/restore-test.sh <dump file>}"
COMPOSE=(docker compose --env-file .env.production -f docker-compose.prod.yml)
SQL() { "${COMPOSE[@]}" exec -T db psql -U nexora -d "$1" -tA -c "$2"; }
"${COMPOSE[@]}" exec -T db psql -U nexora -d postgres -c "DROP DATABASE IF EXISTS nexora_restore_test" > /dev/null
"${COMPOSE[@]}" exec -T db psql -U nexora -d postgres -c "CREATE DATABASE nexora_restore_test" > /dev/null
trap '"${COMPOSE[@]}" exec -T db psql -U nexora -d postgres -c "DROP DATABASE IF EXISTS nexora_restore_test" > /dev/null' EXIT
"${COMPOSE[@]}" exec -T db pg_restore -U nexora -d nexora_restore_test --no-owner < "$FILE"
TABLES=$(SQL nexora_restore_test "select count(*) from information_schema.tables where table_schema='public'")
SCHOOLS=$(SQL nexora_restore_test "select count(*) from schools")
USERS=$(SQL nexora_restore_test "select count(*) from users")
echo "Restore test OK: $TABLES tables, $SCHOOLS schools, $USERS users in the dump."
[ "$TABLES" -gt 20 ] || { echo "Too few tables: the dump looks wrong."; exit 1; }
