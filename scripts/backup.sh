#!/usr/bin/env bash
# Daily database backup (Phase 20). Run from the project folder on the server:  ./scripts/backup.sh
# Writes backups/nexora-YYYYmmdd-HHMMSS.dump (pg_dump custom format, compressed) and deletes dumps older than KEEP_DAYS.
# A backup on the SAME server is not enough: copy the folder off the machine too (see docs/OPERATIONS.md).
set -euo pipefail
cd "$(dirname "$0")/.."
COMPOSE=(docker compose --env-file .env.production -f docker-compose.prod.yml)
DIR="${BACKUP_DIR:-backups}"
KEEP_DAYS="${KEEP_DAYS:-14}"
mkdir -p "$DIR"
OUT="$DIR/nexora-$(date +%Y%m%d-%H%M%S).dump"
"${COMPOSE[@]}" exec -T db pg_dump -U nexora -d nexora_school -Fc > "$OUT.partial"
# A dump that cannot be listed is not a backup.
"${COMPOSE[@]}" exec -T db pg_restore --list < "$OUT.partial" > /dev/null
mv "$OUT.partial" "$OUT"
chmod 600 "$OUT"
find "$DIR" -name 'nexora-*.dump' -mtime +"$KEEP_DAYS" -delete
echo "Backup written: $OUT ($(du -h "$OUT" | cut -f1))"
