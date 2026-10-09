#!/usr/bin/env bash
# Проверка, что резервная копия ВОССТАНАВЛИВАЕТСЯ (копия, которую не проверяли, —
# не копия). Восстанавливает копию шарда во временную базу, считает лица и удаляет её.
# Рабочие базы не трогает.
#
#   infra/backup/restore-check.sh                         — последняя копия
#   infra/backup/restore-check.sh backups/2026-10-09_0330 — конкретная
#
# Запускать раз в неделю, например:
#   0 5 * * 0 cd /srv/skypark && infra/backup/restore-check.sh >> /var/log/skypark-backup.log 2>&1
#
# Настройки: BACKUP_DIR, DATABASES (как в backup.sh), PSQL_CMD и PG_RESTORE_CMD
# (по умолчанию — внутри контейнера db). Для зашифрованных копий нужен закрытый ключ gpg.
set -euo pipefail

BACKUP_DIR=${BACKUP_DIR:-./backups}
DATABASES=${DATABASES:-"recognition_1 recognition_2 recognition_3"}
PG_USER=${POSTGRES_USER:-skypark}
PSQL_CMD=${PSQL_CMD:-"docker compose exec -T db psql -U $PG_USER -v ON_ERROR_STOP=1"}
PG_RESTORE_CMD=${PG_RESTORE_CMD:-"docker compose exec -T db pg_restore -U $PG_USER"}
CHECK_DB=skypark_restore_check

dir=${1:-$(find "$BACKUP_DIR" -mindepth 1 -maxdepth 1 -type d | sort | tail -n 1)}
[[ -d "$dir" ]] || { echo "Нет копий в $BACKUP_DIR" >&2; exit 1; }
echo "Проверяю $dir"
( cd "$dir" && sha256sum --quiet -c SHA256SUMS ) || { echo "ОШИБКА: контрольные суммы не совпали" >&2; exit 1; }

cleanup() { $PSQL_CMD -d postgres -qc "DROP DATABASE IF EXISTS $CHECK_DB" >/dev/null 2>&1; }
trap cleanup EXIT

for db in $DATABASES; do
  if [[ -f "$dir/$db.dump.gpg" ]]; then
    read_dump() { gpg --batch --quiet --decrypt "$dir/$db.dump.gpg"; }
  elif [[ -f "$dir/$db.dump" ]]; then
    read_dump() { cat "$dir/$db.dump"; }
  else
    echo "ОШИБКА: нет копии $db" >&2; exit 1
  fi
  cleanup
  $PSQL_CMD -d postgres -qc "CREATE DATABASE $CHECK_DB" >/dev/null
  read_dump | $PG_RESTORE_CMD --no-owner -d "$CHECK_DB"
  faces=$($PSQL_CMD -d "$CHECK_DB" -tAc "SELECT count(*) FROM face_profiles")
  children=$($PSQL_CMD -d "$CHECK_DB" -tAc "SELECT count(DISTINCT child_id) FROM face_profiles")
  echo "  $db: восстановлена, лиц $faces, детей $children"
done
echo "Копия в порядке"
