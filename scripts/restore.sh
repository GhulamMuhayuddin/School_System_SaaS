#!/usr/bin/env bash
# Restore a dump into the LIVE database (Phase 20). This ERASES the current data. Stop the API first.
#   ./scripts/restore.sh backups/nexora-20261109-020000.dump
set -euo pipefail
cd "$(dirname "$0")/.."
FILE="${1:?usage: scripts/restore.sh <dump file>}"
[ -f "$FILE" ] || { echo "No such file: $FILE"; exit 1; }
COMPOSE=(docker compose --env-file .env.production -f docker-compose.prod.yml)
read -r -p "This REPLACES all data in nexora_school with $FILE. Type RESTORE to continue: " ANSWER
[ "$ANSWER" = "RESTORE" ] || { echo "Cancelled."; exit 1; }
"${COMPOSE[@]}" stop api
"${COMPOSE[@]}" exec -T db pg_restore -U nexora -d nexora_school --clean --if-exists --no-owner < "$FILE"
# Grants and RLS policies are part of the dump, but re-applying them is harmless and guarantees the runtime role is restricted.
"${COMPOSE[@]}" --profile tools run --rm migrate sh -c "pnpm db:rls"
"${COMPOSE[@]}" up -d api
echo "Restore finished. Open the site and check a student list and the fee summary."
