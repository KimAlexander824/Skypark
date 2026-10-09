#!/usr/bin/env bash
# Резервная копия баз СКАЙПАРК (шарды распознавания + база backend).
#
#   infra/backup/backup.sh                      — из корня проекта на сервере
#
# Запускать по расписанию, например раз в сутки ночью (crontab -e на сервере):
#   30 3 * * * cd /srv/skypark && infra/backup/backup.sh >> /var/log/skypark-backup.log 2>&1
#
# Настройки (переменные окружения):
#   BACKUP_DIR        куда класть копии (по умолчанию ./backups). Лучше отдельный диск.
#   KEEP_DAYS         сколько дней хранить (по умолчанию 14)
#   GPG_RECIPIENT     если задан — копии шифруются открытым ключом (gpg --encrypt).
#                     В копиях биометрия детей: в продакшене шифрование ОБЯЗАТЕЛЬНО,
#                     а хранить копии можно только на серверах в Узбекистане.
#   DATABASES         какие базы (по умолчанию recognition_1 recognition_2 recognition_3 backend)
#   PG_DUMP_CMD       чем снимать дамп (по умолчанию pg_dump внутри контейнера db)
#
# Восстановление и проверка копии: infra/backup/restore-check.sh
set -euo pipefail

BACKUP_DIR=${BACKUP_DIR:-./backups}
KEEP_DAYS=${KEEP_DAYS:-14}
DATABASES=${DATABASES:-"recognition_1 recognition_2 recognition_3 backend"}
PG_DUMP_CMD=${PG_DUMP_CMD:-"docker compose exec -T db pg_dump -U ${POSTGRES_USER:-skypark}"}

stamp=$(date +%Y-%m-%d_%H%M)
target="$BACKUP_DIR/$stamp"
umask 077  # копии читает только владелец
mkdir -p "$target"

for db in $DATABASES; do
  file="$target/$db.dump"
  # -Fc — сжатый формат pg_restore; копия консистентна даже при работающем сервисе
  if [[ -n "${GPG_RECIPIENT:-}" ]]; then
    $PG_DUMP_CMD -Fc "$db" | gpg --batch --yes --encrypt --recipient "$GPG_RECIPIENT" -o "$file.gpg"
    file="$file.gpg"
  else
    $PG_DUMP_CMD -Fc "$db" > "$file"
  fi
  [[ -s "$file" ]] || { echo "ОШИБКА: пустая копия $file" >&2; exit 1; }
  echo "$(date '+%F %T') $db → $file ($(du -h "$file" | cut -f1))"
done

( cd "$target" && sha256sum -- * > SHA256SUMS )

# Старые копии удаляем: биометрию нельзя хранить дольше, чем нужно
find "$BACKUP_DIR" -mindepth 1 -maxdepth 1 -type d -mtime +"$KEEP_DAYS" -print -exec rm -rf {} +
echo "$(date '+%F %T') готово: $target"
