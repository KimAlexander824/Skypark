#!/bin/bash
# Создаёт базы из POSTGRES_MULTIPLE_DATABASES (через запятую) при ПЕРВОМ запуске
# контейнера db. Если том pgdata уже есть, скрипт не запускается:
# чтобы пересоздать базы — docker compose down -v
set -euo pipefail
IFS=',' read -ra DBS <<< "${POSTGRES_MULTIPLE_DATABASES:-}"
for db in "${DBS[@]}"; do
  db="$(echo "$db" | xargs)"
  [ -z "$db" ] && continue
  echo "Создаю базу $db"
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres -c "CREATE DATABASE \"$db\";"
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$db" -c "CREATE EXTENSION IF NOT EXISTS vector;"
done
