#!/bin/sh
# Production database bootstrap, runs once when the data volume is empty.
# Creates the restricted runtime role. It has NO superuser and NO BYPASSRLS, so Row Level Security is enforced.
set -eu
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<SQL
CREATE ROLE nexora_app LOGIN PASSWORD '${NEXORA_APP_PASSWORD}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
SQL
