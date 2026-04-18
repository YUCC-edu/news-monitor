#!/usr/bin/env sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
BACKUP_DIR="$ROOT_DIR/backups"
mkdir -p "$BACKUP_DIR"

TS="$(date +%Y%m%d-%H%M%S)"
OUT_FILE="$BACKUP_DIR/news-$TS.sql.gz"

docker exec -e PGPASSWORD=news news-postgres pg_dump -U news -d news | gzip > "$OUT_FILE"
echo "backup created: $OUT_FILE"

# Keep latest 14 backups
ls -1t "$BACKUP_DIR"/news-*.sql.gz 2>/dev/null | awk 'NR>14' | xargs -r rm -f
